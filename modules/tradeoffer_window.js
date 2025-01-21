const TradeofferWindow = {
    SETTINGSDEFAULTS: {
        disabled: [], // disable any unwanted tabs here
        selectors: {
            // pLastSelected: string,
            // qLastSelected: { profile, app, context } // strings
        },
        filter: {
            apps: [
            /*     { // app
             *         id: string,
             *         fetched: boolean,
             *         categories: [
             *             { // category
             *                 id: string,
             *                 name: string,
             *                 pOpened: boolean,
             *                 qOpened: boolean,
             *                 tags: [
             *                     { // tag
             *                         id: string,
             *                         name: string,
             *                         excluded: boolean,
             *                         filtered: boolean
             *                     },
             *                     ...
             *                 ]
             *             },
             *             ...
             *         ]
             *     },
             *     ...
             */
            ]
        },
        // displayMode: int // set by display setup for quick search
        itemsSelectorCustomGroupEntries: [
        /*    {
         *        name: string,
         *        items: [
         *            { appid, contextid, classInstance, amount }
         *            ...
         *        ]
         *    },
         *    ...
         */
        ]
    },

    QUICK_SEARCH_MODE_MAP: {
        page: 0,    '0': 'page',
        scroll: 1,  '1': 'scroll',
    },
    FEATURE_LIST: {
        offerWindow: { title: 'Offer Window', entry: 'offerSetup' },
        offerSummary: { title: 'Offer Summary', entry: 'summarySetup' },
        prefilter: { title: 'Prefilter', entry: 'prefilterSetup' },
        quickSearch: { title: 'Quick Search', entry: 'quickSearchSetup' },
        itemsSelector: { title: 'Items Selector', entry: 'itemsSelectorSetup' },
        itemClassPicker: { title: 'Item Class Options', entry: 'itemClassPickerSetup' },
        message: { title: 'Saved Offer Messages', entry: 'messageSetup' },
        history: { title: 'Trade History', entry: 'historySetup' },
    },
    MIN_TAG_SEARCH: 20,
    INPUT_DELAY: 400, // ms

    shortcuts: {},
    data: {
        inventories: {
        /*    profileid: {
         *        appid: {
         *            contextid: {
         *                full_load: boolean
         *                rgInventory: {},
         *                rgCurrency: {},
         *                rgDescriptions: {}
         *            },
         *            ...
         *        },
         *        ...
         *    },
         *    ...
         */
        },
        descriptionClassAssets: {
        /*    profileid: {
         *        appid: {
         *            contextid: {
         *                classid: {
         *                    count: number
         *                    assets: [
         *                        { assetid, instanceid, amount },
         *                        ...
         *                    ],
         *                    instanceCounts: {
         *                        instanceid: number,
         *                        ...
         *                    },
         *                },
         *                ...
         *            },
         *            ...
         *        },
         *        ...
         *    },
         *   ...
         */
        },
        offerId: null,
        offerMessage: '',
        offerItems: new Set(),
        // states: 0: new offer, 1: existing offer (unchanged), 2: counteroffer
        tradeState: 0,
        appInfo: {}
    },

    setup: async function() {
        let { shortcuts, data } = TradeofferWindow;
        // resize existing tabs
        let tabsContainerElem = document.querySelector('.inventory_user_tabs');
        let userTabElem = tabsContainerElem.querySelector('#inventory_select_your_inventory');
        userTabElem.innerHTML = '<div>You</div>';
        let partnerTabElem = tabsContainerElem.querySelector('#inventory_select_their_inventory');
        partnerTabElem.innerHTML = '<div>Them</div>';
        partnerTabElem.style.float = ''; // float back to left

        // remove apps in app inventory selector with 0 items
        for(let appSelectorOptionElem of document.querySelectorAll('.appselect_options .option > span')) {
            let optionQuantity = parseInt(appSelectorOptionElem.textContent);
            if(optionQuantity === 0) {
                appSelectorOptionElem.parentElement.remove();
            }
        }

        // Add CSS Styles
        GM_addStyle(cssGlobal);
        GM_addStyle(cssTradeofferWindow);

        // load config
        await TradeofferWindow.configLoad();

        addSvgBlock(document.querySelector('.trade_area'));

        // Get and organize appInfo
        const extractAppInfo = (appContextData) => {
            for(let appid in appContextData) {
                let appData = appContextData[appid];
                data.appInfo[appid] ??= {
                    id: appData.appid,
                    icon: appData.icon,
                    logo: appData.inventory_logo,
                    link: appData.link,
                    name: appData.name,
                    contexts: {}
                };

                for(let contextid in appData.rgContexts) {
                    let contextData = appData.rgContexts[contextid];
                    data.appInfo[appid].contexts[contextid] ??= {
                        id: contextData.id,
                        name: contextData.name
                    };
                }
            }
        }
        extractAppInfo(unsafeWindow.g_rgAppContextData);
        extractAppInfo(unsafeWindow.g_rgPartnerAppContextData);

        // Get names, ids, urls for both parties in the trade offer window
        // NOTE: Since we don't have direct access to user's own name, we resort to extracting it out of the hidden escrow message
        Object.assign(data, { me: {}, them: {} });
        let partnerName = data.them.name = document.getElementById('trade_theirs').querySelector('.offerheader h2 > a').textContent;
        let partnerEscrowMessage = document.getElementById('trade_escrow_for_them').textContent;
        let userEscrowMessage = document.getElementById('trade_escrow_for_me').textContent;
        data.me.name = userEscrowMessage.slice(partnerEscrowMessage.indexOf(partnerName), partnerEscrowMessage.indexOf(partnerName) + partnerName.length - partnerEscrowMessage.length);

        data.them.id = unsafeWindow.UserThem.strSteamId
        data.them.url = unsafeWindow.UserThem.strProfileURL;
        data.them.img = document.getElementById('trade_theirs').querySelector('.avatarIcon img').src;
        data.them.escrowDays = unsafeWindow.g_daysTheirEscrow;
        data.me.id = unsafeWindow.UserYou.strSteamId;
        data.me.url = unsafeWindow.UserYou.strProfileURL;
        data.me.img = document.getElementById('trade_yours').querySelector('.avatarIcon img').src;
        data.me.escrowDays = unsafeWindow.g_daysMyEscrow;

        // Check trade state
        let offerParamsArr = document.body.innerHTML.match(/BeginTradeOffer\([^)]+\)/g)[0].split(' ');
        data.offerId = offerParamsArr[1].match(/\d+/)[0];
        if(data.offerId !== '0') {
            data.tradeState = 1;
            // TODO: figure out how to determine an empty mssg vs a "<none>" message????
            // data.offerMessage = document.getElementById('tradeoffer_includedmessage').querySelector('.included_trade_offer_note')..trim()
            for(let assetData of unsafeWindow.g_rgCurrentTradeStatus.me.assets) {
                data.offerItems.add(`${data.me.id}_${assetData.appid}_${assetData.contextid}_${assetData.assetid}_${assetData.amount}`);
            }
            for(let assetData of unsafeWindow.g_rgCurrentTradeStatus.them.assets) {
                data.offerItems.add(`${data.them.id}_${assetData.appid}_${assetData.contextid}_${assetData.assetid}_${assetData.amount}`);
            }
        }

        // add app entries into filter
        await TradeofferWindow.addAppFilterApps();

        let cookieValue = steamToolsUtils.getCookie('strTradeLastInventoryContext');

        // Add tab to the user_tabs section and attach event listeners
        let userTabHTMLString = `<div class="inventory_user_tab userscript-tab" data-name="advanced-options">`
          +     '<div>Advanced</div>'
          + '</div>'
          + `<div class="inventory_user_tab userscript-tab" data-name="remove-last-inv-cookie">`
          +     `<div id="inventory-cookie-removal-status">${cookieValue ? '🔴' : '🟢'}</div>`
          + '</div>';

        // tabsContainerElem.querySelector('[style="clear: both;"]')
        tabsContainerElem.querySelector('.inventory_user_tab_gap')
            .insertAdjacentHTML('beforebegin', userTabHTMLString);

        shortcuts.userSelectTabs = tabsContainerElem;
        shortcuts.overlayContainer = document.querySelector('.trade_area');

        tabsContainerElem.querySelector('[data-name="advanced-options"]').addEventListener('click', TradeofferWindow.overlayOpenListener);
        if(cookieValue) {
            tabsContainerElem.querySelector('[data-name="remove-last-inv-cookie"]').addEventListener('click', TradeofferWindow.removeLastTradeInventoryCookieListener);
        }

        // Add overlay to the DOM and attach event listeners
        const overlayHTMLString = '<div class="userscript-trade-overlay userscript-vars">'
          +     '<div class="userscript-trade-overlay-header">'
          +         '<span class="userscript-trade-overlay-title">?????</span>'
          +     '</div>'
          +     '<div class="userscript-trade-overlay-close">'
          +     '</div>'
          +     '<div class="userscript-trade-overlay-body">'
          +         '' // the body will be generated on each feature setup
          +     '</div>';

        shortcuts.overlayContainer.insertAdjacentHTML('beforeend', overlayHTMLString);

        shortcuts.overlay = shortcuts.overlayContainer.querySelector('& > .userscript-trade-overlay');
        shortcuts.overlayTitle = shortcuts.overlay.querySelector('.userscript-trade-overlay-title');
        shortcuts.overlayBody = shortcuts.overlay.querySelector('.userscript-trade-overlay-body');

        shortcuts.overlay.querySelector('.userscript-trade-overlay-close').addEventListener('click', TradeofferWindow.overlayCloseListener);
    },
    removeLastTradeInventoryCookieListener: function() {
        let activeInventory = unsafeWindow.g_ActiveInventory;
        if(!activeInventory) {
            return;
        }

        // document.cookie = 'strTradeLastInventoryContext=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/tradeoffer/';
        steamToolsUtils.removeCookie('strTradeLastInventoryContext', '/tradeoffer/');

        if(activeInventory.owner.cLoadsInFlight > 0) {
            // inventory is currently loading, try deleting cookie again
            setTimeout(TradeofferWindow.removeLastTradeInventoryCookieListener, 1000);
        } else {
            document.getElementById('inventory-cookie-removal-status').textContent = '🟢';
            TradeofferWindow.shortcuts.tabsContainerElem.querySelector('[data-name="remove-last-inv-cookie"]')
                .removeEventListener('click', TradeofferWindow.removeLastTradeInventoryCookieListener);
        }
    },
    addAppFilterApps: async function() {
        let filterData = globalSettings.tradeoffer.filter;

        const storeAppFilterEntry = (appInfo) => {
            for(let appid in appInfo) {
                if(!filterData.apps.some(x => x.id === appid)) {
                    let newFilterData = {
                        id: appid,
                        fetched: false,
                        categories: []
                    };
                    filterData.apps.push(newFilterData);
                    TradeofferWindow.filterLookupUpdateApp(newFilterData);
                }
            }
        };

        storeAppFilterEntry(unsafeWindow.g_rgAppContextData);
        storeAppFilterEntry(unsafeWindow.g_rgPartnerAppContextData);

        await TradeofferWindow.configSave();
    },

    filterLookupReset: function() {
        TradeofferWindow.data.filterLookup = {
            data: globalSettings.tradeoffer.filter,
            apps: {}
        };
    },
    filterLookupUpdateApp: function(app) {
        const updateAppLookup = (appData) => {
            if(!steamToolsUtils.isSimplyObject(appData)) {
                throw 'TradeofferWindow.filterLookupUpdateApp(): appData is not an object or array!';
            }

            filterLookup.apps[appData.id] = { data: appData, categories: {} };
            if(appData.categories.length) {
                TradeofferWindow.filterLookupUpdateCategory(appData.id, appData.categories);
            }
        }

        let { filterLookup } = TradeofferWindow.data;
        if(!filterLookup) {
            console.warn('TradeofferWindow.filterLookupUpdateApp(): filterLookup does not exist');
            return;
        }

        if(Array.isArray(app)) {
            for(let appData of app) {
                updateAppLookup(appData);
            }
        } else {
            updateAppLookup(app);
        }
    },
    filterLookupUpdateCategory: function(appid, category) {
        const updateCategoryLookup = (categoryData) => {
            if(!steamToolsUtils.isSimplyObject(categoryData)) {
                throw 'TradeofferWindow.filterLookupUpdateCategory(): categoryData is not an object or array!';
            }

            filterLookupApp.categories[categoryData.id] = { data: categoryData, tags: {} };
            if(categoryData.tags.length) {
                TradeofferWindow.filterLookupUpdateTag(appid, categoryData.id, categoryData.tags);
            }
        }

        let filterLookupApp = TradeofferWindow.data.filterLookup?.apps[appid];
        if(!filterLookupApp) {
            console.warn('TradeofferWindow.filterLookupUpdateCategory(): App entry in filterLookup does not exist');
            return;
        }

        if(Array.isArray(category)) {
            for(let categoryData of category) {
                updateCategoryLookup(categoryData);
            }
        } else {
            updateCategoryLookup(category);
        }
    },
    filterLookupUpdateTag: function(appid, categoryid, tag) {
        const updateTagLookup = (tagData) => {
            if(!steamToolsUtils.isSimplyObject(tagData)) {
                throw 'TradeofferWindow.filterLookupUpdateTag(): tagData is not an object or array!';
            }

            filterLookupCategory.tags[tagData.id] = { data: tagData };
        }

        let filterLookupCategory = TradeofferWindow.data.filterLookup?.apps[appid]?.categories[categoryid];
        if(!filterLookupCategory) {
            console.warn('TradeofferWindow.filterLookupUpdateTag(): Category entry in filterLookup does not exist');
            return;
        }

        if(Array.isArray(tag)) {
            for(let tagData of tag) {
                updateTagLookup(tagData);
            }
        } else {
            updateTagLookup(tag);
        }
    },
    filterLookupGet: function(appid, categoryid, tagid) {
        let data = TradeofferWindow.data.filterLookup;
        if(!data) {
            return null;
        }

        if(typeof appid !== 'string' && typeof appid !== 'number') {
            return null;
        }
        data = data.apps[appid];
        if(!data) {
            return null;
        }

        if(categoryid === undefined) {
            return data.data;
        } else if(typeof categoryid !== 'string' && typeof categoryid !== 'number') {
            return null;
        }
        data = data.categories[categoryid];
        if(!data) {
            return null;
        }

        if(tagid === undefined) {
            return data.data;
        } else if(typeof tagid !== 'string' && typeof tagid !== 'number') {
            return null;
        }
        data = data.tags[tagid];
        if(!data) {
            return null;
        }

        return data.data;
    },
    overlayCloseListener: function() {
        let { shortcuts } = TradeofferWindow;

        if(!shortcuts.overlayContainer.classList.contains('overlay')) {
            shortcuts.overlayContainer.classList.add('overlay');
        }

        let activeOverlayBody = shortcuts.overlayBody.dataset.name;
        if(activeOverlayBody === 'offerWindow') {
            shortcuts.overlayContainer.classList.remove('overlay');
        } else {
            TradeofferWindow.overlayBodyToggle('offerWindow');
        }
    },
    overlayOpenListener: function() {
        TradeofferWindow.overlayBodyToggle('offerWindow');
    },
    overlayBodyToggleListener: function(event) {
        let { shortcuts } = TradeofferWindow;
        let toggleElem = event.target.closest('.overlay-toggle');
        if(toggleElem === null) {
            throw 'TradeofferWindow.overlayBodyToggleListener(): Toggle element not found! Was something set up incorrectly?';
        }

        TradeofferWindow.overlayBodyToggle(toggleElem.dataset.name);
    },
    overlayBodyToggle: function(name) {
        let { shortcuts } = TradeofferWindow;

        let overlayData = TradeofferWindow.FEATURE_LIST[name];
        if(!overlayData || (typeof TradeofferWindow[overlayData.entry] !== 'function')) {
            throw 'TradeofferWindow.overlayBodyToggle(): Invalid function! Was something set up incorrectly?';
        }

        shortcuts.overlayTitle.textContent = overlayData.title;

        // TODO: toggle on a dedicated loading overlay

        TradeofferWindow[overlayData.entry]();

        shortcuts.overlayBody.dataset.name = name;
        shortcuts.overlayContainer.classList.add('overlay');
    },





    offerShortcuts: {},
    offerData: {
        offer: {
        /*    profileid: {
         *        appid: {
         *            contextid: {
         *                classid: {
         *                    elem: element,
         *                    count: number,
         *                    assets: [
         *                        { assetid, instanceid, amount },
         *                        ...
         *                    ],
         *                    instanceCounts: {
         *                        instanceid: number,
         *                        ...
         *                    },
         *                },
         *                ...
         *            },
         *            ...
         *        },
         *        ...
         *    },
         *    ...
         */
        },
        itemlistLastSelected: {
            // profileid: { appid, contextid, classid }
        }
    },

    offerSetup: async function() {
        let { shortcuts, data, offerShortcuts, offerData } = TradeofferWindow;

        if(offerShortcuts.body !== undefined) {
            return;
        }

        // set up overlay
        const offerBodyHTMLString = '<div class="offer-window-body">'
          +     '<div class="offer-window-main-control">'
          +         '<div class="main-control-section">'
          +             '<div class="offer-window-comment-box">'
          +                 '<textarea id="offer-window-comment-box" maxlength="128" placeholder="(Optional) Add comment to offer">'
          +                 '</textarea>'
          +             '</div>'
          +             '<button class="userscript-trade-action main-control-action overlay-toggle" data-name="message">Select Comment</button>'
          +         '</div>'
          +         '<div class="main-control-action-group">'
          +             '<button class="userscript-trade-action main-control-action overlay-toggle" data-name="history">History</button>'
          +             '<button class="userscript-trade-action main-control-action overlay-toggle" data-name="offerSummary">Finalize Offer</button>'
          +         '</div>'
          +     '</div>'
          +     `<div id="offer-window-itemlist-me" class="offer-itemlist" data-id="${data.me.id}">`
          +         '<div class="itemlist-header">'
          +             '<div class="userscript-icon-name-container">'
          +                 `<img src="${data.me.img}">`
          +                 data.me.name
          +             '</div>'
          +         '</div>'
          +         '<div class="itemlist-list">'
          +         '</div>'
          +         '<div class="itemlist-overlay">'
          +         '</div>'
          +     '</div>'
          +     '<div class="offer-window-actions">'
          +         '<div class="offer-window-action overlay-toggle" data-name="prefilter">P</div>'
          +         '<div class="offer-window-action overlay-toggle" data-name="quickSearch">Q</div>'
          +         '<div class="offer-window-action overlay-toggle" data-name="itemsSelector">I</div>'
          +      '<div class="offer-window-action" data-name="deleteItems">D</div>'
          +         '<div class="offer-window-action" data-name="resetItems">R</div>'
          +     '</div>'
          +     `<div id="offer-window-itemlist-them" class="offer-itemlist" data-id="${data.them.id}">`
          +         '<div class="itemlist-header">'
          +             '<div class="userscript-icon-name-container">'
          +                 `<img src="${data.them.img}">`
          +                 data.them.name
          +             '</div>'
          +         '</div>'
          +         '<div class="itemlist-list">'
          +         '</div>'
          +         '<div class="itemlist-overlay">'
          +         '</div>'
          +     '</div>'
          + '</div>';

        shortcuts.overlayBody.insertAdjacentHTML('beforeend', offerBodyHTMLString);

        offerShortcuts.body = shortcuts.overlayBody.querySelector('& > .offer-window-body');
        offerShortcuts.message = document.getElementById('offer-window-comment-box');
        offerShortcuts.itemListMe = document.getElementById('offer-window-itemlist-me');
        offerShortcuts.itemListThem = document.getElementById('offer-window-itemlist-them');
        offerShortcuts.itemList = {
            [data.me.id]: offerShortcuts.itemListMe,
            [data.them.id]: offerShortcuts.itemListThem,
        };

        // TODO: add comment and send offer listeners here
        offerShortcuts.body.querySelector('[data-name="message"]').addEventListener('click', TradeofferWindow.overlayBodyToggleListener);
        offerShortcuts.body.querySelector('[data-name="history"]').addEventListener('click', TradeofferWindow.overlayBodyToggleListener);
        offerShortcuts.body.querySelector('[data-name="offerSummary"]').addEventListener('click', TradeofferWindow.overlayBodyToggleListener);

        // toggle summary overlay
        // toggle comments overlay
        let offerActionsElem = offerShortcuts.body.querySelector('.offer-window-actions');
        offerActionsElem.querySelector('[data-name="prefilter"]').addEventListener('click', TradeofferWindow.overlayBodyToggleListener);
        offerActionsElem.querySelector('[data-name="quickSearch"]').addEventListener('click', TradeofferWindow.overlayBodyToggleListener);
        offerActionsElem.querySelector('[data-name="itemsSelector"]').addEventListener('click', TradeofferWindow.overlayBodyToggleListener);
        offerActionsElem.querySelector('[data-name="deleteItems"]').addEventListener('click', TradeofferWindow.offerItemlistDeleteSelectedListener);
        offerActionsElem.querySelector('[data-name="resetItems"]').addEventListener('click', TradeofferWindow.offerResetListener);

        for(let profileid in offerShortcuts.itemList) {
            offerShortcuts.itemList[profileid].querySelector('.itemlist-list').addEventListener('click', TradeofferWindow.offerItemlistSelectItemsListener);
        }

        offerData.offer = {
            [data.me.id]: {},
            [data.them.id]: {},
        };
        offerData.lastSelected = {
            [data.me.id]: null,
            [data.them.id]: null,
        };

        // Populate items of the created offer
        if(data.tradeState !== 0) {
            // enable overlay to prevent interaction

            for(let offerItemData of data.offerItems) {
                let [profileid, appid, contextid, assetid, amount] = offerItemData.split('_');
                await TradeofferWindow.offerItemlistAddAssetItem(profileid, appid, contextid, assetid, parseInt(amount));
            }

            // disable overlay
        }
    },
    offerUpdateTradeState: function() {
        const containsAllProfileItems = (isMe) => {
            let profileid = data[isMe ? 'me' : 'them'].id;
            for(let [classData, classid, contextid, appid] of TradeofferWindow.offerProfileDataIter(offer[profileid])) {
                totalOfferItemsCount += classData.assets;
                for(let offerAsset of classData.assets) {
                    if( !data.offerItems.has(`${profileid}_${appid}_${contextid}_${offerAsset.assetid}_${offerAsset.amount}`) ) {
                        return false;
                    }
                }
            }

            return true;
        };

        let { data, offerData: { offer } } = TradeofferWindow;
        let totalOfferItemsCount = 0;

        if(data.tradeState === 0) {
            return;
        }

        let isInitState = containsAllProfileItems(true) && containsAllProfileItems(false)
          && data.offerItems.size === totalOfferItemsCount;

        data.tradeState = isInitState ? 1 : 2;
    },
    offerItemlistAddClassItems: async function(profileid, appid, contextid, classid, instanceid, amount = 1, reverse = false) {
        let { offerShortcuts, offerData, data } = TradeofferWindow;

        if(amount === 0) {
            console.warn('TradeofferWindow.offerItemlistAddClassItems(): Adding 0 items?');
            return;
        }

        let inventory = await TradeofferWindow.getTradeInventory(profileid, appid, contextid, TradeofferWindow.filterInventoryBlockSetup());
        if(!inventory) {
            console.warn('TradeofferWindow.offerItemlistAddClassItems(): Inventory not found, exiting...');
            return;
        }

        let descriptClass = data.descriptionClassAssets[profileid]?.[appid]?.[contextid]?.[classid];
        if(!descriptClass) {
            console.warn('TradeofferWindow.offerItemlistAddClassItems(): Class in descriptions not found, exiting...');
            return;
        }
        let descriptClassAssets = descriptClass.assets;

        let offerClass = offerData.offer[profileid]?.[appid]?.[contextid]?.[classid];
        if(!offerClass) {
            offerClass = { elem: null, count: 0, assets: [], instanceCounts: {} };
            offerData.offer[profileid] ??= {};
            offerData.offer[profileid][appid] ??= {};
            offerData.offer[profileid][appid][contextid] ??= {};
            offerData.offer[profileid][appid][contextid][classid] ??= offerClass;
        }

        let count = 0;
        if(reverse) {
            descriptClassAssets = descriptClassAssets.toReversed();
        }
        for(let descriptAsset of descriptClassAssets) {
            let amountNeeded = amount - count;
            if(amountNeeded === 0) {
                break;
            }

            if(instanceid !== undefined && descriptAsset.instanceid !== instanceid) {
                continue;
            }

            let offerAsset = offerClass.assets.find(x => x.assetid === descriptAsset.assetid);
            if(offerAsset) {
                let amountAvailable = descriptAsset.amount - offerAsset.amount;
                if(amountAvailable === 0) {
                    continue;
                }

                let amountToAdd = Math.min(amountAvailable, amountNeeded);
                offerAsset.amount += amountToAdd;
                offerClass.count += amountToAdd;
                offerClass.instanceCounts[descriptAsset.instanceid] += amountToAdd;
                count += amountToAdd;
            } else {
                let amountToAdd = Math.min(descriptAsset.amount, amountNeeded);
                offerClass.assets.push({ assetid: descriptAsset.assetid, instanceid: descriptAsset.instanceid, amount: amountToAdd });
                offerClass.count += amountToAdd;
                offerClass.instanceCounts[descriptAsset.instanceid] ??= 0;
                offerClass.instanceCounts[descriptAsset.instanceid] += amountToAdd;
                count += amountToAdd;
            }
        }

        if(count !== amount) {
            console.warn(`TradeofferWindow.offerItemlistAddClassItems(): There was not enough assets to add to offer (${count}/${amount})?!?!`);
        }

        // close itemlist classinstance viewer before updating elems

        if(offerClass.elem === null) {
            let itemHTMLString = TradeofferWindow.offerGenerateItemHTMLString(appid, contextid, classid);
            let itemListElem = offerShortcuts.itemList[profileid].querySelector('.itemlist-list');
            itemListElem.insertAdjacentHTML('beforeend', itemHTMLString);
            offerClass.elem = itemListElem.lastElementChild;
        }

        offerClass.elem.dataset.amount = offerClass.count.toLocaleString();
        return count;
    },
    offerItemlistAddAssetItem: async function(profileid, appid, contextid, assetid, amount = 1) {
        let { offerShortcuts, offerData, data } = TradeofferWindow;

        let inventory = await TradeofferWindow.getTradeInventory(profileid, appid, contextid, TradeofferWindow.filterInventoryBlockSetup());
        if(!inventory) {
            console.warn('TradeofferWindow.offerItemlistAddAssetItem(): Inventory not found, exiting...');
            return;
        }

        let assetData = inventory.rgInventory[assetid];
        if(!assetData) {
            throw 'TradeofferWindow.offerItemlistAddAssetItem(): Asset data not found?!?!';
        }

        let offerClass = offerData.offer[profileid]?.[appid]?.[contextid]?.[assetData.classid];
        if(!offerClass) {
            offerClass = { elem: null, count: 0, assets: [], instanceCounts: {} };
            offerData.offer[profileid] ??= {};
            offerData.offer[profileid][appid] ??= {};
            offerData.offer[profileid][appid][contextid] ??= {};
            offerData.offer[profileid][appid][contextid][assetData.classid] ??= offerClass;
        }

        if(amount > parseInt(assetData.amount)) {
            console.warn('TradeofferWindow.offerItemlistAddAssetItem(): Amount to be added is greater than asset\'s total amount, adding maximum amount...');
        }

        let amountToSet = Math.min(parseInt(assetData.amount), amount);
        let existingOfferAsset = offerClass.assets.find(x => x.assetid === assetid);
        if(existingOfferAsset) {
            let assetCountDiff = amountToSet - existingOfferAsset.amount;
            existingOfferAsset.amount = amountToSet;
            offerClass.count += assetCountDiff;
            offerClass.instanceCounts[assetData.instanceid] += assetCountDiff;
        } else {
            offerClass.assets.push({ assetid: assetid, instanceid: assetData.instanceid, amount: amountToSet });
            offerClass.count += amountToSet;
            offerClass.instanceCounts[assetData.instanceid] ??= 0;
            offerClass.instanceCounts[assetData.instanceid] += amountToSet;
        }

        // close itemlist classinstance viewer before updating elems

        if(offerClass.elem === null) {
            let itemHTMLString = TradeofferWindow.offerGenerateItemHTMLString(appid, contextid, assetData.classid);
            let itemListElem = offerShortcuts.itemList[profileid].querySelector('.itemlist-list');
            itemListElem.insertAdjacentHTML('beforeend', itemHTMLString);
            offerClass.elem = itemListElem.lastElementChild;
        }

        offerClass.elem.dataset.amount = offerClass.count.toLocaleString();
    },
    offerGenerateItemHTMLString: function(appid, contextid, classid) {
        // Find the description data for this classinstance
        // This is a little jank, but works for now until descriptions gets refactored
        let { inventories, descriptionClassAssets } = TradeofferWindow.data;

        let descript;
        for(let profileid in inventories) {
            if(descript) {
                break;
            }

            let inventoryContext = inventories[profileid]?.[appid]?.[contextid];
            if(!inventoryContext) {
                continue;
            }

            let descriptClass = descriptionClassAssets[profileid]?.[appid]?.[contextid]?.[classid];
            if(!descriptClass || descriptClass.count === 0) {
                continue;
            }

            let arbitraryAsset = descriptClass.assets[0];
            descript = inventoryContext.rgDescriptions[`${classid}_${arbitraryAsset.instanceid}`];
        }

        if(!descript) {
            console.error('TradeofferWindow.itemsSelectorGenerateItem(): No description found!!!');
        }

        let imgUrl = descript?.icon_url ? `https://community.akamai.steamstatic.com/economy/image/${descript.icon_url}/96fx96f` : '';
        let name = descript?.name ?? '???';

        let styleAttrString = '';
        styleAttrString += descript?.name_color ? `border-color: #${descript.name_color};` : '';
        styleAttrString += descript?.background_color ? `background-color: #${descript.background_color};` : '';
        if(styleAttrString.length) {
            styleAttrString = ` style="${styleAttrString}"`;
        }

        let dataAttrString = '';
        dataAttrString += ` data-appid="${appid}"`;
        dataAttrString += ` data-contextid="${contextid}"`;
        dataAttrString += ` data-classid="${classid}"`;

        return `<div class="inventory-item-container" title="${name}"${dataAttrString}${styleAttrString}>`
          +     `<img loading="lazy" src="${imgUrl}" alt="${name}">`
          + '</div>';
    },

    offerItemlistSelectItemsListener: function(event) {
        let { offerData: { lastSelected } } = TradeofferWindow;

        let targetItemElem = event.target.closest('.inventory-item-container');
        if(!targetItemElem) {
            return;
        }

        let itemlistElem = event.target.closest('.itemlist-list');
        if(!itemlistElem) {
            console.error('TradeofferWindow.offerItemlistSelectItemsListener(): item list element not found, but item element exists???');
            return;
        }

        if(event.ctrlKey) {
            TradeofferWindow.overlayBodyToggle('itemClassPicker');
            return;
        }

        let lastSelectedData = lastSelected[itemlistElem.dataset.id];
        // if(!event.shiftKey && !event.ctrlKey) {
        if(event.shiftKey) {
            let itemElemList = itemlistElem.querySelectorAll('.inventory-item-container');

            let prevIndex, currIndex;
            if(lastSelectedData === null) {
                prevIndex = 0;
            }
            for(let i=0; i<itemElemList.length; i++) {
                if(itemElemList[i].dataset.appid === lastSelectedData.appid
                  && itemElemList[i].dataset.contextid === lastSelectedData.contextid
                  && itemElemList[i].dataset.classid === lastSelectedData.classid) {
                    prevIndex = i;
                    if(currIndex !== undefined) {
                        break;
                    }
                }

                if(itemElemList[i].dataset.appid === targetItemElem.dataset.appid
                  && itemElemList[i].dataset.contextid === targetItemElem.dataset.contextid
                  && itemElemList[i].dataset.classid === targetItemElem.dataset.classid) {
                    currIndex = i;
                    if(prevIndex !== undefined) {
                        break;
                    }
                }
            }

            if(prevIndex === currIndex) {
                return;
            }

            let minIndex = Math.min(prevIndex, currIndex);
            let maxIndex = Math.max(prevIndex, currIndex);

            for(let i=minIndex+1; i<maxIndex; i++) {
                itemElemList[i].classList.add('selected');
            }
            itemElemList[currIndex].classList.add('selected');
        } else {
            targetItemElem.classList.toggle('selected');
        }

        lastSelected[itemlistElem.dataset.id] = {
            appid: targetItemElem.dataset.appid,
            contextid: targetItemElem.dataset.contextid,
            classid: targetItemElem.dataset.classid,
        };
    },
    offerItemlistDeleteSelectedListener: function() {
        let { data, offerShortcuts: { itemListMe, itemListThem }, offerData: { offer, lastSelected } } = TradeofferWindow;

        const removeSelectedItems = (selectedItems, isMe) => {
            let profileid = data[isMe ? 'me' : 'them'].id;
            for(let itemElem of selectedItems) {
                let { appid, contextid, classid } = itemElem.dataset;

                let offerContext = offer[profileid]?.[appid]?.[contextid];
                if(!offerContext?.[classid]) {
                    console.error('TradeofferWindow.offerDeleteSelected(): class instance not found in offer data?!?!?');
                } else {
                    delete offerContext[classid];
                }

                itemElem.remove();
            }
        };

        removeSelectedItems(itemListMe.querySelectorAll('.selected'), true);
        removeSelectedItems(itemListThem.querySelectorAll('.selected'), false);

        lastSelected[itemListMe.dataset.id] = null;
        lastSelected[itemListThem.dataset.id] = null;
    },
    offerResetListener: async function() {
        let { data, offerShortcuts, offerData } = TradeofferWindow;

        offerData.offer = {};
        for(let itemElem of offerShortcuts.itemListMe.querySelectorAll('.itemlist-list .inventory-item-container')) {
            itemElem.remove();
        }
        for(let itemElem of offerShortcuts.itemListThem.querySelectorAll('.itemlist-list .inventory-item-container')) {
            itemElem.remove();
        }

        for(let offerItemData of data.offerItems) {
            let [profileid, appid, contextid, assetid, amount] = offerItemData.split('_');
            await TradeofferWindow.offerItemlistAddAssetItem(profileid, appid, contextid, assetid, parseInt(amount));
        }
        offerShortcuts.message.value = data.offerMessage;

        offerData.lastSelected[offerShortcuts.itemListMe.dataset.id] = null;
        offerData.lastSelected[offerShortcuts.itemListThem.dataset.id] = null;
    },
    offerProfileDataIter: function(offerProfileData) {
        function* offerDataIter(dataset) {
            for(let appid in dataset) {
                for(let contextid in dataset[appid]) {
                    for(let classid in dataset[appid][contextid]) {
                        yield [ dataset[appid][contextid][classid], classid, contextid, appid ];
                    }
                }
            }
        }

        return offerDataIter(offerProfileData);
    },





    selectorMenuToggleListener: function(event) {
        if(!event.currentTarget.matches('.main-control-selector-container')) {
            throw 'TradeofferWindow.selectorMenuToggleListener(): Not attached to selector container!';
        }

        if(event.target.closest('.main-control-selector-select')) {
            event.currentTarget.classList.toggle('active');
        } else if(event.target.closest('.main-control-selector-options')) {
            event.currentTarget.classList.remove('active');
        }
    },
    selectorMenuSelectListener: function(event) {
        if(!event.currentTarget.matches('.main-control-selector-options')) {
            throw 'TradeofferWindow.selectorMenuSelectListener(): Not attached to options container!';
        } else if(!event.currentTarget.parentElement.matches('.main-control-selector-container')) {
            throw 'TradeofferWindow.selectorMenuSelectListener(): Options container is not immediate child of selector container!';
        }

        let optionElem = event.target;
        while (!optionElem.matches('.main-control-selector-option')) {
            if (optionElem.matches('.main-control-selector-options')) {
                throw 'tradeofferSelectorMenuSelectListener(): No option found! Was the document structured correctly?';
            }
            optionElem = optionElem.parentElement;
        }

        TradeofferWindow.selectorMenuSelect(event.currentTarget.parentElement, optionElem);

        // the event bubbling will take care of toggling the selector menu back off
    },
    selectorMenuSelect: function(selectorElem, option) {
        if(!(selectorElem instanceof Element) || (!(option instanceof Element) && !(typeof option !== 'number'))) {
            throw 'TradeofferWindow.selectorMenuSelect(): invalid arg types...';
        }

        if(!(option instanceof Element)) {
            option = selectorElem.querySelector(`.main-control-selector-option[data-id="${option}"]`);
            if(!option) {
                console.warn('TradeofferWindow.selectorMenuSelect(): No valid options found');
            }
        } else if(!option.matches('.main-control-selector-option')) {
            throw 'TradeofferWindow.selectorMenuSelect(): option element provided is not an option!';
        }

        let selectorSelectElem = selectorElem.querySelector('.main-control-selector-select');
        selectorSelectElem.innerHTML = option.innerHTML;
        Object.assign(selectorSelectElem.dataset, option.dataset);
        Object.assign(selectorElem.dataset, option.dataset);
    },





    prefilterShortcuts: {},

    prefilterSetup: function() {
        console.log('Prefilter WIP');

        let { prefilterShortcuts } = TradeofferWindow;

        if(prefilterShortcuts.body !== undefined) {
            return;
        }

        // generate prefilter body and attach to overlay body
        const prefilterBodyHTMLString = '<div class="prefilter-body">'
          +     '<div class="prefilter-main-control">'
          +         '<div class="main-control-section">'
          +             TradeofferWindow.generateAppSelectorHTMLString({ id: 'selector-prefilter-app' })
          +         '</div>'
          +     '</div>'
          +     '<div class="prefilter-tag-category-containers">'
          +         '' // populated when an app is selected
          +     '</div>'
          + '</div>';

        TradeofferWindow.shortcuts.overlayBody.insertAdjacentHTML('beforeend', prefilterBodyHTMLString);

        // add shortcuts to parts of the prefilter body
        let prefilterBody = prefilterShortcuts.body = TradeofferWindow.shortcuts.overlayBody.querySelector('.prefilter-body');
        prefilterShortcuts.selector = document.getElementById('selector-prefilter-app');
        prefilterShortcuts.selectorOptions = prefilterShortcuts.selector.querySelector('.main-control-selector-options');
        prefilterShortcuts.categories = prefilterBody.querySelector('.prefilter-tag-category-containers');

        // add event listeners to everything in the prefilter body minus the categories,
        //   those will be handled dynamically
        prefilterShortcuts.selector.addEventListener('click', TradeofferWindow.selectorMenuToggleListener);
        prefilterShortcuts.selectorOptions.addEventListener('click', TradeofferWindow.prefilterAppSelectorMenuSelectListener);

        let lastSelectedApp = globalSettings.tradeoffer.selectors.pLastSelected;
        if(lastSelectedApp) {
            prefilterShortcuts.selectorOptions.querySelector(`[data-id="${lastSelectedApp}"]`)?.click();
        }
    },
    prefilterAppSelectorMenuSelectListener: async function(event) {
        event.stopPropagation();

        if(!event.currentTarget.matches('.main-control-selector-options')) {
            throw 'TradeofferWindow.selectorMenuSelectListener(): Not attached to options container!';
        } else if(!event.currentTarget.parentElement.matches('.main-control-selector-container')) {
            throw 'TradeofferWindow.selectorMenuSelectListener(): Options container is not immediate child of selector container!';
        }

        let optionElem = event.target;
        while (!optionElem.matches('.main-control-selector-option')) {
            if (optionElem.matches('.main-control-selector-options')) {
                throw 'tradeofferSelectorMenuSelectListener(): No option found! Was the document structured correctly?';
            }
            optionElem = optionElem.parentElement;
        }

        let selectorElem = event.currentTarget.parentElement;
        if(selectorElem.dataset.id === optionElem.dataset.id) {
            return;
        }

        TradeofferWindow.selectorMenuSelect(selectorElem, optionElem);

        let { categories: categoriesElem } = TradeofferWindow.prefilterShortcuts;
        let optionId = optionElem.dataset.id;
        let filterData = await TradeofferWindow.getMarketFilterData(optionId);

        let categoryElemList = categoriesElem.querySelectorAll('.prefilter-tag-category');
        let categoryElemIndex = 0;
        let prefilterCategoryIndex = 0;

        while(categoryElemIndex<categoryElemList.length && prefilterCategoryIndex<filterData.categories.length) {
            TradeofferWindow.prefilterRepopulateCategoryElement(categoryElemList[categoryElemIndex++], filterData.categories[prefilterCategoryIndex++]);
        }

        if(categoryElemIndex===categoryElemList.length) {
            let newCategoriesHTMLString = '';
            let newIndex = categoryElemIndex;
            while(prefilterCategoryIndex<filterData.categories.length) {
                newCategoriesHTMLString += TradeofferWindow.generateCategoryHTMLString(filterData.categories[prefilterCategoryIndex++]);
            }

            TradeofferWindow.prefilterShortcuts.categories.insertAdjacentHTML('beforeend', newCategoriesHTMLString);

            let categoryElemList = TradeofferWindow.prefilterShortcuts.categories.querySelectorAll('.prefilter-tag-category');
            while(newIndex<categoryElemList.length) {
                let newCategoryElem = categoryElemList[newIndex++];
                newCategoryElem.querySelector('.prefilter-tag-category-searchbar')
                  ?.addEventListener('input', steamToolsUtils.debounceFunction(TradeofferWindow.prefilterCategorySearchInputListener, TradeofferWindow.INPUT_DELAY));
                newCategoryElem.querySelector('.prefilter-tag-category-reset')
                  ?.addEventListener('click', TradeofferWindow.prefilterCategoryResetListener);
                newCategoryElem.querySelector('.prefilter-tags-selected')
                  ?.addEventListener('click', TradeofferWindow.prefilterCategoryTagsExludeToggleListener);
                newCategoryElem.querySelector('.prefilter-tags')
                  ?.addEventListener('click', TradeofferWindow.prefilterCategoryTagsExludeToggleListener);
                newCategoryElem.querySelector('.prefilter-collapse-bar')
                  ?.addEventListener('click', TradeofferWindow.prefilterCategoryToggleListener);
            }
        } else if(prefilterCategoryIndex===filterData.categories.length) {
            while(categoryElemIndex<categoryElemList.length) {
                categoryElemList[categoryElemIndex++].remove();
            }
        }

        globalSettings.tradeoffer.selectors.pLastSelected = optionId;
        await TradeofferWindow.configSave();
    },
    // TODO: collapsable category containers, hides only unselected tags
    prefilterRepopulateCategoryElement: function(categoryElem, categoryData) {
        if(!(categoryElem instanceof Element) || !categoryElem.matches('.prefilter-tag-category')) {
            throw 'TradeofferWindow.prefilterRepopulateCategoryElement(): Invalid category container element!'
        }

        categoryElem.dataset.id = categoryData.id;
        categoryElem.querySelector('.prefilter-tag-category-title').textContent = categoryData.name;
        let searchbarElem = categoryElem.querySelector('.prefilter-tag-category-searchbar');
        let excludeSearchbar = categoryData.tags.length < TradeofferWindow.MIN_TAG_SEARCH;

        if(searchbarElem && excludeSearchbar) {
            searchbarElem.remove();
        } else if(!searchbarElem && !excludeSearchbar) {
            const searchbarHTMLString = '<div class="prefilter-tag-category-searchbar">'
              +     `<input class="userscript-input" type="text" placeholder="Search ${categoryData.name.toLowerCase()} tags">`
              + '</div>';

            categoryElem.querySelector('.prefilter-tag-category-title')
              .insertAdjacentHTML('afterend', searchbarHTMLString);
        }

        let tagsHTMLStrings = TradeofferWindow.generateTagsHTMLStrings(categoryData.tags);
        categoryElem.querySelector('.prefilter-tags-selected').innerHTML = tagsHTMLStrings[0];
        categoryElem.querySelector('.prefilter-tags').innerHTML = tagsHTMLStrings[1];

        let isOpened = categoryElem.classList.contains('hidden');
        if(isOpened !== categoryData.pOpened) {
            categoryElem.classList.toggle('hidden');
        }
    },
    prefilterCategoryToggleListener: async function(event) {
        let categoryElem = event.currentTarget.parentElement;
        let tagsElem = categoryElem.querySelector('.prefilter-tags');
        if(!event.currentTarget.matches('.prefilter-collapse-bar')) {
            throw 'TradeofferWindow.prefilterCategoryToggleListener(): Not attached to a collapse bar!';
        } else if(!tagsElem) {
            throw 'TradeofferWindow.prefilterCategoryToggleListener(): No tags container found!';
        }

        tagsElem.classList.toggle('hidden');

        let appid = TradeofferWindow.prefilterShortcuts.selector.dataset.id;
        let categoryid = categoryElem.dataset.id;

        let categoryConfig = TradeofferWindow.filterLookupGet(appid, categoryid);

        if(!categoryConfig) {
            throw 'TradeofferWindow.prefilterCategoryToggleListener(): category not found in config?!?!';
        }

        categoryConfig.pOpened = !categoryConfig.pOpened;
        await TradeofferWindow.configSave();
    },
    prefilterCategoryResetListener: async function(event) {
        let categoryElem = event.currentTarget.parentElement;
        if(!event.currentTarget.matches('.prefilter-tag-category-reset')) {
            throw 'TradeofferWindow.prefilterCategoryResetListener(): Not attached to the correct element class!';
        } else if(!categoryElem.matches('.prefilter-tag-category')) {
            throw 'TradeofferWindow.prefilterCategoryResetListener(): Not contained in a category container!';
        }

        let tagsSelectedElem = categoryElem.querySelector('.prefilter-tags-selected');
        let tagsElem = categoryElem.querySelector('.prefilter-tags');
        if(!tagsSelectedElem || !tagsElem) {
            throw 'TradeofferWindow.prefilterCategoryResetListener(): one or both tags lists not found!';
        }
        for(let tagSelectedElem of tagsSelectedElem.querySelectorAll('.prefilter-tag-container')) {
            let tagSelectedIndex = parseInt(tagSelectedElem.dataset.index);
            let nextTagElem = null;

            for(let tagElem of tagsElem.querySelectorAll('.prefilter-tag-container')) {
                if(parseInt(tagElem.dataset.index) > tagSelectedIndex) {
                    let nextTagElem = tagElem;
                    break;
                }
            }

            nextTagElem
              ? nextTagElem.before(tagSelectedElem)
              : tagsElem.appendChild(tagSelectedElem);
        }

        let appid = TradeofferWindow.prefilterShortcuts.selector.dataset.id;
        let categoryid = categoryElem.dataset.id;

        let tagsListConfig = TradeofferWindow.filterLookupGet(appid, categoryid)?.tags

        if(!tagsListConfig) {
            throw 'TradeofferWindow.prefilterCategoryResetListener(): tag list not found in config?!?!';
        }

        for(let tag of tagsListConfig) {
            tag.excluded = false;
        }

        await TradeofferWindow.configSave();
    },
    prefilterCategorySearchInputListener: function(event) {
        let tagElemList = event.target;
        while(!tagElemList.matches('.prefilter-tag-category')) {
            if(tagElemList.matches('.prefilter-body')) {
                throw 'TradeofferWindow.prefilterCategorySearchInputListener(): category container not found! Is the document structured correctly?';
            }
            tagElemList = tagElemList.parentElement;
        }
        tagElemList = tagElemList.querySelectorAll('.prefilter-tags .prefilter-tag-container');

        // NOTE: Simple case insensitive compare, cannot deal with accents and special chars
        let inputStr = event.target.value.toLowerCase();
        for(let tagElem of tagElemList) {
            if(tagElem.textContent.toLowerCase().includes(inputStr) || tagElem.dataset.id.toLowerCase().includes(inputStr)) {
                tagElem.classList.remove('hidden');
            } else {
                tagElem.classList.add('hidden');
            }
        }
    },
    prefilterCategoryTagsExludeToggleListener: async function(event) {
        let categoryElem = event.currentTarget.parentElement;
        if(!event.currentTarget.matches('.prefilter-tags, .prefilter-tags-selected')) {
            throw 'TradeofferWindow.prefilterCategoryTagsExludeToggleListener(): Not attached to a tags container!';
        } else if(!categoryElem.matches('.prefilter-tag-category')) {
            throw 'TradeofferWindow.prefilterCategoryTagsExludeToggleListener(): Not contained in a category container!';
        }

        let tagElem = event.target;
        while(!tagElem.matches('.prefilter-tag-container')) {
            if(tagElem.matches('.prefilter-tags')) {
                throw 'TradeofferWindow.prefilterCategoryTagsExludeToggleListener(): No tag container found!';
            }
            tagElem = tagElem.parentElement;
        }

        let sourceElem = event.currentTarget;
        let destinationElem = sourceElem.matches('.prefilter-tags')
          ? categoryElem.querySelector('.prefilter-tags-selected')
          : categoryElem.querySelector('.prefilter-tags');

        if(!destinationElem) {
            throw 'TradeofferWindow.prefilterCategoryTagsExludeToggleListener(): Destination Element not found!';
        }

        let tagIndex = parseInt(tagElem.dataset.index);
        let nextTagElem;
        for(let destTagElem of destinationElem.querySelectorAll('.prefilter-tag-container')) {
            if(parseInt(destTagElem.dataset.index) > tagIndex) {
                nextTagElem = destTagElem;
                break;
            }
        }

        nextTagElem
          ? nextTagElem.before(tagElem)
          : destinationElem.appendChild(tagElem);

        let appid = TradeofferWindow.prefilterShortcuts.selector.dataset.id;
        let categoryid = categoryElem.dataset.id;
        let tagid = tagElem.dataset.id;

        let tagConfig = TradeofferWindow.filterLookupGet(appid, categoryid, tagid);

        if(!tagConfig) {
            throw 'TradeofferWindow.prefilterCategoryTagsExludeToggleListener(): tag no found in config?!?!';
        }

        tagConfig.excluded = !tagConfig.excluded;
        await TradeofferWindow.configSave();
    },





    quickSearchShortcuts: {},
    quickSearchData: {
        currentContext: { profile: null, app: null, context: null },
        // inventory: {
        //     full_load: boolean
        //     data: object,
        //     dataList: array,
        //     dataFiltered: array,
        //     selectedItems: object,
        //     disabledItems: object,
        //     pageCount: number,
        //     currency: array,
        //     descriptions: object,
        // },
        // searchText: string,
        // facet: populated after inventory load
        // filtersSelected: 0,
        // mode: // 0: page, 1: scroll // set during display setup/toggle
        currentPage: null,
        display: {
            rows: 5,
            columns: 6
        },
        scrolling: {
            pageCount: 5,
            pages: [],
            // observer: created and saved on setup
        },
        paging: {
            pages: {
                fg: null,
                bg: null
            },
            isAnimating: false,
            keyframes: {
                enterRight: [{ left: '100%' }, { left: '0%' }],
                exitRight: [{ left: '0%' }, { left: '100%' }],
                enterLeft: [{ left: '-100%' }, { left: '0%' }],
                exitLeft: [{ left: '0%' }, { left: '-100%' }]
            },
            options: {
                duration: 400,
                easing: 'ease-in-out'
            },
            finishAnimation: function(animationObj, cb) {
                function finishAnimating(event) {
                    TradeofferWindow.quickSearchData.paging.isAnimating = false;
                    cb();
                }
                animationObj.addEventListener('finish', finishAnimating);
            }
        },
        select: {
            lastSelected: null
        }
    },

    quickSearchSetup: function() {
        console.log('Quick Search WIP');

        let { data, quickSearchShortcuts } = TradeofferWindow;

        TradeofferWindow.quickSearchDisplaySelectResetAll();
        TradeofferWindow.quickSearchDisabledItemsReset();

        if (quickSearchShortcuts.body !== undefined) {
            return;
        }

        // generate prefilter body and attach to overlay body
        const quickSearchMainControlHTMLString = '<div class="quick-search-main-control">'
          +     '<div class="main-control-section">'
          +         TradeofferWindow.generateProfileSelectorHTMLString({ id: 'selector-quick-search-profile' })
          +         TradeofferWindow.generateAppSelectorHTMLString({ useUserApps: false, usePartnerApps: false, id: 'selector-quick-search-app', placeholderText: 'Select profile first', disabled: true })
          +         TradeofferWindow.generateContextSelectorHTMLString(undefined, undefined, { id: 'selector-quick-search-context', placeholderText: 'Select profile/app first', disabled: true })
          +         '<button id="quick-search-inventory-load" class="userscript-trade-action">'
          +             'Load'
          +         '</button>'
          +     '</div>'
          +     '<div id="quick-search-display-mode-toggle" class="main-control-action-group">'
          +         '<button class="userscript-trade-action main-control-action" data-qs-mode="page">P</button>'
          +         '<button class="userscript-trade-action main-control-action" data-qs-mode="scroll">S</button>'
          +     '</div>'
          +     '<div class="main-control-section">'
          +         '<button id="quick-search-add-to-offer" class="userscript-trade-action">'
          +             'Add Selected'
          +         '</button>'
          +     '</div>'
          + '</div>';
        const quickSearchInventoryFacetHTMLString = '<div id="quick-search-facet" class="quick-search-inventory-facet facet-container">'
          +     '<input id="quick-search-search-inventory" class="userscript-input" type="text" placeholder="Search item name">'
          +     '' // tag categories is generated when inventory is loaded
          + '</div>';
        const quickSearchInventoryDisplayHTMLString = '<div class="quick-search-inventory-display inventory-display-container">'
          +     '<div id="quick-search-pages" class="inventory-pages-container">'
          +         '' // pages will be set up on display mode selection
          +     '</div>'
          +     '<div id="quick-search-page-nav" class="inventory-page-nav">'
          +         `<button class="inventory-page-nav-btn" data-step="${Number.MIN_SAFE_INTEGER}">|&lt</button>`
          +         '<button class="inventory-page-nav-btn" data-step="-10">&lt&lt</button>'
          +         '<button class="inventory-page-nav-btn" data-step="-1">&lt</button>'
          +         '<div class="inventory-page-nav-numbers">'
          +             '<span class="inventory-page-nav-text number first">1</span>'
          +             '<span class="inventory-page-nav-text ellipsis first">...</span>'
          +             '<span class="inventory-page-nav-text number previous"></span>'
          +             '<span class="inventory-page-nav-text number current"></span>'
          +             '<span class="inventory-page-nav-text number next"></span>'
          +             '<span class="inventory-page-nav-text ellipsis last">...</span>'
          +             '<span class="inventory-page-nav-text number last"></span>'
          +         '</div>'
          +         '<button class="inventory-page-nav-btn" data-step="1">&gt</button>'
          +         '<button class="inventory-page-nav-btn" data-step="10">&gt&gt</button>'
          +         `<button class="inventory-page-nav-btn" data-step="${Number.MAX_SAFE_INTEGER}">&gt|</button>`
          +     '</div>'
          + '</div>';
        const quickSearchInventoryOverlayHTMLString = '<div class="quick-search-inventory-overlay userscript-overlay loading">'
          +     cssAddThrobber()
          + '</div>';
        const quickSearchBodyHTMLString = '<div class="quick-search-body">'
          +     quickSearchMainControlHTMLString
          +     quickSearchInventoryFacetHTMLString
          +     quickSearchInventoryDisplayHTMLString
          +     quickSearchInventoryOverlayHTMLString
          + '</div>';

        TradeofferWindow.shortcuts.overlayBody.insertAdjacentHTML('beforeend', quickSearchBodyHTMLString);

        // add shortcuts to parts of the quick search body
        quickSearchShortcuts.body = TradeofferWindow.shortcuts.overlayBody.querySelector('.quick-search-body');
        quickSearchShortcuts.selectorProfile = document.getElementById('selector-quick-search-profile');
        quickSearchShortcuts.selectorOptionsProfile = quickSearchShortcuts.selectorProfile.querySelector('.main-control-selector-options');
        quickSearchShortcuts.selectorApp = document.getElementById('selector-quick-search-app');
        quickSearchShortcuts.selectorOptionsApp = quickSearchShortcuts.selectorApp.querySelector('.main-control-selector-options');
        quickSearchShortcuts.selectorContext = document.getElementById('selector-quick-search-context');
        quickSearchShortcuts.selectorOptionsContext = quickSearchShortcuts.selectorContext.querySelector('.main-control-selector-options');
        quickSearchShortcuts.displayModeToggle = document.getElementById('quick-search-display-mode-toggle');

        quickSearchShortcuts.searchInput = document.getElementById('quick-search-search-inventory');
        quickSearchShortcuts.facet = document.getElementById('quick-search-facet');

        quickSearchShortcuts.display = quickSearchShortcuts.body.querySelector('.quick-search-inventory-display');
        quickSearchShortcuts.pages = document.getElementById('quick-search-pages');
        quickSearchShortcuts.pageNavigationBar = document.getElementById('quick-search-page-nav');
        quickSearchShortcuts.pageNumbers = quickSearchShortcuts.pageNavigationBar.querySelector('.inventory-page-nav-numbers');

        quickSearchShortcuts.overlay = quickSearchShortcuts.body.querySelector('.quick-search-inventory-overlay');

        // add event listeners to everything in the quick search body
        quickSearchShortcuts.selectorProfile.addEventListener('click', TradeofferWindow.selectorMenuToggleListener);
        quickSearchShortcuts.selectorOptionsProfile.addEventListener('click', TradeofferWindow.quickSearchSelectorProfileSelectListener);
        quickSearchShortcuts.selectorApp.addEventListener('click', TradeofferWindow.selectorMenuToggleListener);
        quickSearchShortcuts.selectorOptionsApp.addEventListener('click', TradeofferWindow.quickSearchSelectorAppSelectListener);
        quickSearchShortcuts.selectorContext.addEventListener('click', TradeofferWindow.selectorMenuToggleListener);
        quickSearchShortcuts.selectorOptionsContext.addEventListener('click', TradeofferWindow.selectorMenuSelectListener);

        document.getElementById('quick-search-inventory-load').addEventListener('click', TradeofferWindow.quickSearchLoadInventoryListener);
        quickSearchShortcuts.displayModeToggle.addEventListener('click', TradeofferWindow.quickSearchDisplayModeToggleListener);
        document.getElementById('quick-search-add-to-offer').addEventListener('click', TradeofferWindow.quickSearchAddSelectedListener);

        quickSearchShortcuts.searchInput.addEventListener('input', steamToolsUtils.debounceFunction(TradeofferWindow.quickSearchFacetSearchInventoryInputListener, TradeofferWindow.INPUT_DELAY));

        quickSearchShortcuts.pages.addEventListener('click', TradeofferWindow.quickSearchDisplaySelectItemsListener);
        quickSearchShortcuts.pageNavigationBar.addEventListener('click', TradeofferWindow.quickSearchDisplayPaginateListener);

        // Select the profile/app/context selectors from last load, default to user
        let lastLoadedContext = globalSettings.tradeoffer.selectors.qLastSelected;
        if(lastLoadedContext) {
            quickSearchShortcuts.selectorOptionsProfile.querySelector(`[data-id="${data.me.id}"]`)?.click();
            quickSearchShortcuts.selectorOptionsApp.querySelector(`[data-id="${lastLoadedContext.app}"]`)?.click();
            quickSearchShortcuts.selectorOptionsContext.querySelector(`[data-id="${lastLoadedContext.context}"]`)?.click();
        }
    },
    quickSearchDisabledItemsReset: function() {
        // grab items from both sides and update item list to disable during quick search
        // update disable state for currently rendered items

        let { offerData: { offer }, quickSearchShortcuts, quickSearchData: { currentContext, inventory } } = TradeofferWindow;
        if(!quickSearchShortcuts.body || !currentContext.context) {
            return;
        }

        let offerClassItems = offer[currentContext.profile]?.[currentContext.app]?.[currentContext.context] ?? {};

        // update inventory data here
        inventory.disabledItems.clear();
        for(let classid in offerClassItems) {
            for(let assetData of offerClassItems[classid].assets) {
                if(assetData.amount > 0) {
                    inventory.disabledItems.add(assetData.assetid);
                }
            }
        }
        for(let selectedItem of inventory.selectedItems) {
            if(inventory.disabledItems.has(selectedItem)) {
                inventory.selectedItems.delete(selectedItem);
            }
        }

        // update inventory items in DOM
        for(let itemElem of quickSearchShortcuts.body.querySelectorAll('.inventory-item-container')) {
            let itemData = inventory.data[itemElem.dataset.id];
            if(!itemData) {
                continue;
            }

            if(inventory.disabledItems.has(itemData.id)) {
                itemElem.classList.remove('selected');
                itemElem.classList.add('disabled');
            } else {
                itemElem.classList.remove('disabled');
            }
        }
    },
    quickSearchLoadInventoryListener: async function(event) {
        console.log('quickSearchLoadInventoryListener() WIP');

        let { quickSearchShortcuts, quickSearchData } = TradeofferWindow;
        let { currentContext } = quickSearchData;
        let profileid = quickSearchShortcuts.selectorProfile.dataset.id;
        let appid = quickSearchShortcuts.selectorApp.dataset.id;
        let contextid = quickSearchShortcuts.selectorContext.dataset.id;

        if(profileid === '-1' || appid === '-1' || contextid === '-1') {
            console.warn('TradeofferWindow.quickSearchLoadInventoryListener(): profile/app/context not selected!');
            return;
        } else if(profileid === currentContext.profile && appid === currentContext.app && contextid === currentContext.context) {
            console.log('TradeofferWindow.quickSearchLoadInventoryListener(): is current context, no need to load inventory...');
            return;
        }

        quickSearchData.facet = [];
        quickSearchData.filtersSelected = 0;

        // activate loading overlay
        quickSearchShortcuts.body.classList.add('overlay');

        // hide facet lists
        quickSearchShortcuts.facet.classList.add('loading');

        // clear inventory display items
        for(let pageElem of quickSearchShortcuts.pages.querySelectorAll('.inventory-page')) {
            TradeofferWindow.quickSearchDisplayPageReset(pageElem);
        }

        quickSearchShortcuts.selectorProfile.classList.remove('active');
        quickSearchShortcuts.selectorApp.classList.remove('active');
        quickSearchShortcuts.selectorContext.classList.remove('active');

        let inventoryFilterBlockfn = TradeofferWindow.filterInventoryBlockSetup(TradeofferWindow.quickSearchProcessInventoryBlockAsset);
        let inventory = await TradeofferWindow.getTradeInventory(profileid, appid, contextid, inventoryFilterBlockfn);
        let inventorySorted = INVENTORY_ITEM_PRIORITY.toSorted(appid, inventory.rgInventory, inventory.rgDescriptions);

        // likely have not been processed yet
        if(quickSearchData.facet.length === 0) {
            TradeofferWindow.quickSearchProcessInventory(inventory);
        }

        quickSearchData.inventory = {
            full_load: inventory.full_load,
            data: inventory.rgInventory,
            dataList: inventorySorted,
            dataFiltered: [],
            selectedItems: new Set(),
            disabledItems: new Set(),
            pageCount: 0,
            currency: inventory.rgCurrency,
            descriptions: inventory.rgDescriptions
        }
        quickSearchData.currentContext = {
            profile: profileid,
            app: appid,
            context: contextid
        };
        globalSettings.tradeoffer.selectors.qLastSelected = quickSearchData.currentContext;

        TradeofferWindow.quickSearchDisabledItemsReset();

        // set up inventroy display
        TradeofferWindow.quickSearchFacetGenerate(quickSearchData.facet);
        TradeofferWindow.quickSearchApplyFilter();
        TradeofferWindow.quickSearchDisplaySetup();

        // show facet lists
        quickSearchShortcuts.facet.classList.remove('loading');

        // deactivate loading overlay
        quickSearchShortcuts.body.classList.remove('overlay');

        await TradeofferWindow.configSave();
    },
    quickSearchProcessInventoryBlockAsset: function(asset, descript) {
        let { quickSearchData } = TradeofferWindow;
        let { facet: facetList } = quickSearchData;

        for(let tag of descript.tags) {
            let filterCategory = TradeofferWindow.filterLookupGet(descript.appid, tag.category);
            let filterTag = TradeofferWindow.filterLookupGet(descript.appid, tag.category, tag.internal_name);

            let facetCategory = facetList.find(x => x.id === tag.category);
            if(!facetCategory) {
                facetCategory = {
                    id: filterCategory.id,
                    name: filterCategory.name,
                    open: filterCategory.qOpened,
                    isFiltering: false,
                    tags: []
                };
                facetList.push(facetCategory);
            }

            let facetTag = facetCategory.tags.find(x => x.id === filterTag.id);
            if(!facetTag) {
                facetTag = {
                    id: filterTag.id,
                    name: filterTag.name,
                    filtered: filterTag.filtered,
                    count: 0
                };
                facetCategory.tags.push(facetTag);
            }
            facetTag.count++;

            facetCategory.isFiltering ||= facetTag.filtered;
            if(facetTag.filtered) {
                quickSearchData.filtersSelected++;
            }
        }
    },
    quickSearchProcessInventory: function(inventory) {
        for(let assetid in inventory.rgInventory) {
            let asset = inventory.rgInventory[assetid];
            let descript = inventory.rgDescriptions[`${asset.classid}_${asset.instanceid}`];

            TradeofferWindow.quickSearchProcessInventoryBlockAsset(asset, descript);
        }
    },

    quickSearchAddSelectedListener: async function(event) {
        console.log('quickSearchAddSelectedListener() WIP');

        let { currentContext, inventory: { selectedItems } } = TradeofferWindow.quickSearchData;

        let { profile: profileid, app: appid, context: contextid } = currentContext;
        for(let assetid of selectedItems) {
            await TradeofferWindow.offerItemlistAddAssetItem(profileid, appid, contextid, assetid, 1);
        }
        TradeofferWindow.offerUpdateTradeState();

        TradeofferWindow.overlayBodyToggle('offerWindow');
    },
    quickSearchSelectorProfileSelectListener: function(event) {
        if(!event.currentTarget.matches('.main-control-selector-options')) {
            throw 'TradeofferWindow.quickSearchSelectorProfileSelectListener(): Not attached to options container!';
        } else if(!event.currentTarget.parentElement.matches('.main-control-selector-container')) {
            throw 'TradeofferWindow.quickSearchSelectorProfileSelectListener(): Options container is not immediate child of selector container!';
        }

        let { data, quickSearchShortcuts, selectorData } = TradeofferWindow;

        let optionElem = event.target;
        while (!optionElem.matches('.main-control-selector-option')) {
            if (optionElem.matches('.main-control-selector-options')) {
                throw 'TradeofferWindow.quickSearchSelectorProfileSelectListener(): No option found! Was the document structured correctly?';
            }
            optionElem = optionElem.parentElement;
        }

        let selectorElem = event.currentTarget.parentElement;
        if(selectorElem.dataset.id === optionElem.dataset.id) {
            return;
        }

        TradeofferWindow.selectorMenuSelect(selectorElem, optionElem);

        // reconfigure app selector
        let selectedProfileid = selectorElem.dataset.id;
        let selectorAppElem = quickSearchShortcuts.selectorApp;

        let appOptions = selectorData[selectedProfileid];
        let contextOptions = appOptions[selectorAppElem.dataset.id];

        quickSearchShortcuts.selectorApp.classList.remove('disabled', 'active');

        if(!contextOptions || !contextOptions.length) {
            selectorAppElem.dataset.id = '-1';

            let selectorAppSelectElem = selectorAppElem.querySelector('.main-control-selector-select');
            selectorAppSelectElem.innerHTML = `<img src="${selectorData.blankImg}">`
              + 'Select App';
            selectorAppSelectElem.dataset.id = '-1';
        }

        let appsData;
        if(selectedProfileid === data.me.id) {
            appsData = unsafeWindow.UserYou.rgAppInfo;
        } else if(selectedProfileid === data.them.id) {
            appsData = unsafeWindow.UserThem.rgAppInfo;
        } else {
            throw 'TradeofferWindow.quickSearchSelectorProfileSelectListener(): profile id is not user nor partner!?!?!';
        }

        let newSelectorAppOptionsHTMLString = '';
        for(let appid in appOptions) {
            let appInfo = appsData[appid];
            newSelectorAppOptionsHTMLString += TradeofferWindow.generateSelectorOptionHTMLString(appInfo.name, { id: appid }, appInfo.icon);
        }
        quickSearchShortcuts.selectorOptionsApp.innerHTML = newSelectorAppOptionsHTMLString;


        // reconfigure context selector
        let selectorContextElem = quickSearchShortcuts.selectorContext;
        let contextExists = contextOptions && contextOptions.length;
        let hasContext = contextExists ? contextOptions.some(x => x === selectorContextElem.dataset.id) : false;
        quickSearchShortcuts.selectorContext.classList.remove('active');

        if(!contextExists || !hasContext) {
            if(!contextExists) {
                selectorContextElem.classList.add('disabled');
            }
            selectorContextElem.dataset.id = '-1';

            let selectorContextSelectElem = selectorContextElem.querySelector('.main-control-selector-select');
            selectorContextSelectElem.textContent = !contextExists ? 'Select app first' : 'Select Category';
            selectorContextSelectElem.dataset.id = '-1';

            if(contextExists) {
                let appid = selectorAppElem.dataset.id;
                let contextsData = appsData[appid].rgContexts;

                let newSelectorContextOptionsHTMLString = '';
                for(let contextid of contextOptions) {
                    let contextInfo = contextsData[contextid];
                    if(parseInt(contextid) === 0) {
                        continue;
                    }
                    newSelectorContextOptionsHTMLString += TradeofferWindow.generateSelectorOptionHTMLString(contextInfo.name, { id: contextInfo.id });
                }
                quickSearchShortcuts.selectorOptionsContext.innerHTML = newSelectorContextOptionsHTMLString;
            }
        }
    },
    quickSearchSelectorAppSelectListener: function(event) {
        if(!event.currentTarget.matches('.main-control-selector-options')) {
            throw 'TradeofferWindow.selectorMenuSelectListener(): Not attached to options container!';
        } else if(!event.currentTarget.parentElement.matches('.main-control-selector-container')) {
            throw 'TradeofferWindow.selectorMenuSelectListener(): Options container is not immediate child of selector container!';
        }

        let { data, quickSearchShortcuts, selectorData } = TradeofferWindow;

        let optionElem = event.target;
        while (!optionElem.matches('.main-control-selector-option')) {
            if (optionElem.matches('.main-control-selector-options')) {
                throw 'tradeofferSelectorMenuSelectListener(): No option found! Was the document structured correctly?';
            }
            optionElem = optionElem.parentElement;
        }

        let selectorElem = event.currentTarget.parentElement;
        if(selectorElem.dataset.id === optionElem.dataset.id) {
            return;
        }

        TradeofferWindow.selectorMenuSelect(selectorElem, optionElem);

        quickSearchShortcuts.selectorProfile.classList.remove('active');
        quickSearchShortcuts.selectorContext.classList.remove('disabled', 'active');
        quickSearchShortcuts.selectorContext.dataset.id = '-1';

        let selectorContextSelectElem = quickSearchShortcuts.selectorContext.querySelector('.main-control-selector-select');
        selectorContextSelectElem.innerHTML = 'Select Category';
        selectorContextSelectElem.dataset.id = '-1';

        let profileid = quickSearchShortcuts.selectorProfile.dataset.id;
        let appid = optionElem.dataset.id;
        let contextOptions = selectorData[profileid][appid];
        let contextsData;
        if(profileid === data.me.id) {
            contextsData = unsafeWindow.UserYou.rgAppInfo[appid].rgContexts;
        } else if(profileid === data.them.id) {
            contextsData = unsafeWindow.UserThem.rgAppInfo[appid].rgContexts;
        } else {
            throw 'TradeofferWindow.quickSearchSelectorProfileSelectListener(): profile id is not user nor partner!?!?!';
        }

        let newSelectorContextOptionsHTMLString = '';
        for(let contextid of contextOptions) {
            let contextInfo = contextsData[contextid];
            if(parseInt(contextid) === 0) {
                continue;
            }
            newSelectorContextOptionsHTMLString += TradeofferWindow.generateSelectorOptionHTMLString(contextInfo.name, { id: contextInfo.id });
        }
        quickSearchShortcuts.selectorOptionsContext.innerHTML = newSelectorContextOptionsHTMLString;
    },
    quickSearchDisplaySelectItemsListener: function(event) {
        let itemElem = event.target.closest('.inventory-item-container');
        if(!itemElem) {
            return;
        }

        let { select: selectData, mode, inventory } = TradeofferWindow.quickSearchData;
        if(event.shiftKey) {
            let itemElemList = (mode === 0)
              ? itemElem.closest('.inventory-page').querySelectorAll('.inventory-item-container')
              : event.currentTarget.querySelectorAll('.inventory-item-container');

            let noStartIndex = true;
            let prevIndex, currIndex;
            for(let i=0; i<itemElemList.length; i++) {
                if(itemElemList[i].dataset.id === selectData.lastSelected?.dataset.id) {
                    noStartIndex = false;
                    prevIndex = i;
                    if(currIndex !== undefined) {
                        break;
                    }
                }
                if(itemElemList[i].dataset.id === itemElem.dataset.id) {
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

            let minIndex = Math.min(prevIndex, currIndex);
            let maxIndex = Math.max(prevIndex, currIndex);

            for(let i=minIndex+1; i<maxIndex; i++) {
                let itemData = inventory.data[itemElemList[i].dataset.id];
                if(itemData && inventory.disabledItems.has(itemData.id)) {
                    continue;
                }

                inventory.selectedItems.add(itemData.id);
                itemElemList[i].classList.add('selected');
            }
            let currItemData = inventory.data[itemElemList[currIndex].dataset.id];
            if(!(currItemData && inventory.disabledItems.has(currItemData.id))) {
                inventory.selectedItems.add(currItemData.id);
                itemElemList[currIndex].classList.add('selected');
            }
            if(noStartIndex) {
                let prevItemData = inventory.data[itemElemList[prevIndex].dataset.id];
                if(!(prevItemData && inventory.disabledItems.has(prevItemData.id))) {
                    inventory.selectedItems.add(prevItemData.id);
                    itemElemList[prevIndex].classList.add('selected');
                }
            }
        } else {
            let itemData = inventory.data[itemElem.dataset.id];
            if(itemData) {
                inventory.selectedItems[ inventory.selectedItems.has(itemData.id) ? 'delete' : 'add' ](itemData.id);
                itemElem.classList.toggle('selected');
            }
        }

        selectData.lastSelected = itemElem;
    },
    quickSearchDisplaySelectResetAll: function() {
        let { quickSearchData, quickSearchShortcuts } = TradeofferWindow;
        let { select, inventory } = quickSearchData;

        if(!quickSearchShortcuts.pages || !inventory) {
            return;
        }

        inventory.selectedItems.clear();

        for(let itemElem of quickSearchShortcuts.pages.querySelectorAll('.selected')) {
            itemElem.classList.remove('selected');
        }

        select.lastSelected = null;
    },
    quickSearchDisplaySelectResetPage: function(pageElem) {
        let { select, inventory } = TradeofferWindow.quickSearchData;

        let lastSelectedId = select.lastSelected?.dataset.id;
        for(let itemElem of pageElem.querySelectorAll('.selected')) {
            let itemData = inventory.data[itemElem.dataset.id];
            if(itemData) {
                inventory.selectedItems.delete(itemData.id);
            }
            itemElem.classList.remove('selected');

            if(itemElem.dataset.id === lastSelectedId) {
                select.lastSelected = null;
            }
        }
    },

    quickSearchFacetGenerate: function(facetList) {
        const generateFacetEntryHTMLString = (entryData) => {
            return `<div class="facet-list-entry-container" data-id="${entryData.id}">`
              +     '<label class="facet-list-entry-label">'
              +         `<input type="checkbox"${entryData.filtered ? ' checked' : ''}>`
              +         `<span class="facet-entry-title">${entryData.name}</span>`
              +         `<span class="facet-entry-detail">(${entryData.count.toLocaleString()})</span>`
              +     '<label>'
              + '</div>';
        };

        let facetElem = TradeofferWindow.quickSearchShortcuts.facet;

        let facetListsHTMLString = '';
        for(let category of facetList) {
            let facetSectionTitleHTMLString = `<div class="facet-section-title">${category.name}</div>`;
            let facetSectionSearchHTMLString = '';
            if(category.tags.length >= TradeofferWindow.MIN_TAG_SEARCH) {
                facetSectionSearchHTMLString = '<div class="facet-list-searchbar">'
                  +     `<input class="userscript-input" type="text" placeholder="Search ${category.name.toLowerCase()}">`
                  + '</div>';
            }

            let facetSectionEntriesHTMLString = '';
            for(let entry of category.tags) {
                facetSectionEntriesHTMLString += generateFacetEntryHTMLString(entry);
            }

            facetListsHTMLString += `<div class="facet-section${category.open ? '' : ' hidden'}" data-id="${category.id}">`
              +     facetSectionTitleHTMLString
              +     facetSectionSearchHTMLString
              +     `<div class="facet-list">`
              +         facetSectionEntriesHTMLString
              +     '</div>'
              + '</div>';
        }

        for(let facetSectionElem of facetElem.querySelectorAll('.facet-section')) {
            facetSectionElem.remove();
        }
        facetElem.insertAdjacentHTML('beforeend', facetListsHTMLString);

        for(let facetTitleElem of facetElem.querySelectorAll('.facet-section-title')) {
            facetTitleElem.addEventListener('click', TradeofferWindow.quickSearchFacetCategoryToggleListener);
        }
        for(let facetSearchElem of facetElem.querySelectorAll('.facet-list-searchbar .userscript-input')) {
            facetSearchElem.addEventListener('input', steamToolsUtils.debounceFunction(TradeofferWindow.quickSearchFacetSearchCategoryInputListener, TradeofferWindow.INPUT_DELAY));
        }
        for(let facetListElem of facetElem.querySelectorAll('.facet-list')) {
            facetListElem.addEventListener('change', TradeofferWindow.quickSearchFacetTagSelectListener);
        }
    },
    quickSearchFacetCategoryToggleListener: async function(event) {
        let { quickSearchData } = TradeofferWindow;
        let facetCategoryElem = event.target.closest('.facet-section');
        if(!facetCategoryElem) {
            throw 'TradeofferWindow.quickSearchFacetCategoryToggleListener(): facet section not found?!?! Is the document formatted correctly?';
        }

        facetCategoryElem.classList.toggle('hidden');
        let categoryConfig = TradeofferWindow.filterLookupGet(quickSearchData.currentContext.app, facetCategoryElem.dataset.id);
        if(categoryConfig) {
            categoryConfig.qOpened = !categoryConfig.qOpened;
        }

        let categoryFacet = quickSearchData.facet.find(x => x.id === facetCategoryElem.dataset.id);
        if(!categoryFacet) {
            throw 'TradeofferWindow.quickSearchFacetCategoryToggleListener(): facet data not found?!?!';
        }
        categoryFacet.open = !categoryFacet.open;

        await TradeofferWindow.configSave();
    },
    quickSearchFacetSearchCategoryInputListener: function(event) {
        // NOTE: May or may not need to change simple string comparisons into regex matching, or maybe split string matching

        let searchText = event.target.value.toLowerCase() ?? '';
        let facetSectionElem = event.target.closest('.facet-section');
        if(!facetSectionElem) {
            throw 'TradeofferWindow.quickSearchFacetSearchCategoryInputListener(): target is not within a facet section????';
        }

        for(let facetEntryElem of facetSectionElem.querySelectorAll('.facet-list .facet-list-entry-container')) {
            if(facetEntryElem.dataset.id.toLowerCase().includes(searchText) || facetEntryElem.textContent.toLowerCase().includes(searchText)) {
                facetEntryElem.classList.remove('hidden');
            } else {
                facetEntryElem.classList.add('hidden');
            }
        }
    },
    quickSearchFacetSearchInventoryInputListener: function(event) {
        let { quickSearchData } = TradeofferWindow;

        if(!quickSearchData.inventory) {
            return;
        }

        let searchText = event.target.value;
        let searchTextOld = quickSearchData.searchText;
        quickSearchData.searchText = searchText;

        if(searchText.includes(searchTextOld)) {
            TradeofferWindow.quickSearchApplyFilter(searchText);
        } else {
            TradeofferWindow.quickSearchApplyFilter();
        }
    },
    quickSearchFacetTagSelectListener: async function(event) {
        let { quickSearchData } = TradeofferWindow;

        let facetEntryElem = event.target.closest('.facet-list-entry-container');
        if(!facetEntryElem) {
            throw 'TradeofferWindow.quickSearchFacetTagSelectListener(): tag container not found?!?! Is the document formatted correctly?';
        }

        let facetCategoryElem = facetEntryElem.closest('.facet-section');
        if(!facetCategoryElem) {
            throw 'TradeofferWindow.quickSearchFacetTagSelectListener(): facet section not found?!?! Is the document formatted correctly?';
        }

        let tagConfig = TradeofferWindow.filterLookupGet(quickSearchData.currentContext.app, facetCategoryElem.dataset.id, facetEntryElem.dataset.id);
        tagConfig.filtered = event.target.checked;

        let categoryFacet = quickSearchData.facet.find(x => x.id === facetCategoryElem.dataset.id);
        if(!categoryFacet) {
            throw 'TradeofferWindow.quickSearchFacetTagSelectListener(): facet category data not found?!?!';
        }

        let tagFacet = categoryFacet.tags.find(x => x.id === facetEntryElem.dataset.id);
        if(!tagFacet) {
            throw 'TradeofferWindow.quickSearchFacetTagSelectListener(): facet tag data not found?!?!';
        }

        let filterOnCount = categoryFacet.tags.reduce((count, tag) => tag.filtered ? ++count : count, 0);
        let toggleFilterOn = !tagFacet.filtered && event.target.checked;
        tagFacet.filtered = event.target.checked;
        categoryFacet.isFiltering = !(filterOnCount === 1 && !toggleFilterOn);

        toggleFilterOn ? quickSearchData.filtersSelected++ : quickSearchData.filtersSelected--;

        if(filterOnCount === 0 && toggleFilterOn) {
            TradeofferWindow.quickSearchApplyFilter({ category: categoryFacet.id, tag: tagFacet.id, diff: false });
        } else if(filterOnCount > 1 && !toggleFilterOn) {
            TradeofferWindow.quickSearchApplyFilter({ category: categoryFacet.id, tag: tagFacet.id, diff: true });
        } else {
            TradeofferWindow.quickSearchApplyFilter();
        }

        await TradeofferWindow.configSave();
    },
    quickSearchApplyFilter(filter) {
        // NOTE: May or may not need to change simple string comparisons into regex matching, or maybe split string matching

        let { quickSearchShortcuts, quickSearchData } = TradeofferWindow;
        let { inventory, facet, searchText, filtersSelected } = quickSearchData;

        if(!inventory) {
            return;
        }

        if(filter) {
            if(typeof filter === 'string') {
                filter = filter.toLowerCase();
                inventory.dataListFiltered = inventory.dataListFiltered.filter(item => {
                    let descript = inventory.descriptions[`${item.classid}_${item.instanceid}`];
                    return descript.name.toLowerCase().includes(filter) || descript.type.toLowerCase().includes(filter);
                });
            } else if(steamToolsUtils.isSimplyObject(filter)) {
                inventory.dataListFiltered = inventory.dataListFiltered.filter(item => {
                    let descript = inventory.descriptions[`${item.classid}_${item.instanceid}`];

                    let itemTag = descript.tags.find(x => x.category === filter.category);
                    if(!itemTag) {
                        return false;
                    }

                    if(itemTag.internal_name === filter.tag) {
                        return !filter.diff;
                    }

                    return filter.diff;
                });
            } else {
                console.warn('TradeofferWindow.quickSearchApplyFilter(): invalid filter type! Inventory not filtered...');
            }
        } else {
            searchText = quickSearchShortcuts.searchInput.value;
            inventory.dataListFiltered = inventory.dataList.filter(item => {
                let descript = inventory.descriptions[`${item.classid}_${item.instanceid}`];
                if(typeof searchText === 'string') {
                    if(!descript.name.toLowerCase().includes(searchText) && !descript.type.toLowerCase().includes(searchText)) {
                        return false;
                    }
                }

                if(filtersSelected === 0) {
                    return true;
                }

                for(let facetCategory of facet) {
                    if(!facetCategory.isFiltering) {
                        continue;
                    }

                    let itemTag = descript.tags.find(x => x.category === facetCategory.id);
                    if(!itemTag) {
                        return false;
                    }

                    let facetTag = facetCategory.tags.find(x => x.id === itemTag.internal_name);
                    if(!facetTag) {
                        console.warn('TradeofferWindow.quickSearchApplyFilter(): tag not found in facet data?!?! Item will not be filtered out...');
                        return true;
                    }

                    if(!facetTag.filtered) {
                        return false;
                    }
                }

                return true;
            });
        }

        inventory.pageCount = Math.ceil(quickSearchData.inventory.dataListFiltered.length / (quickSearchData.display.rows*quickSearchData.display.columns));
        TradeofferWindow.quickSearchShortcuts.pageNumbers.querySelector('.number.last').textContent = inventory.pageCount;

        // re-render pages if needed
        if(quickSearchData.mode === 0) {
            let fgPage = quickSearchData.paging.pages.fg;
            let fgPageNum = parseInt(fgPage.dataset.page);
            if(!Number.isInteger(fgPageNum)) {
                fgPageNum = 1;
            } if(fgPageNum > inventory.pageCount) {
                fgPageNum = Math.max(1, inventory.pageCount);
            }
            TradeofferWindow.quickSearchDisplayPopulatePage(fgPage, fgPageNum);
            TradeofferWindow.quickSearchDisplayUpdatePageNavigationBar(fgPageNum);
        } else if(quickSearchData.mode === 1) {
            let pages = quickSearchData.scrolling.pages;
            let currentPageNum = parseInt(quickSearchData.currentPage.dataset.page);
            if(!Number.isInteger(currentPageNum) || currentPageNum < 1) {
                currentPageNum = 1;
            } else if(currentPageNum > inventory.pageCount) {
                currentPageNum = Math.max(1, inventory.pageCount);
            }

            let pageOffset = Math.floor(quickSearchData.scrolling.pageCount/2);
            quickSearchData.scrolling.observer.disconnect();
            for(let i=0; i<pages.length; i++) {
                TradeofferWindow.quickSearchDisplayPopulatePage(pages[i], i+currentPageNum-pageOffset);
            }
            for(let pageElem of quickSearchData.scrolling.pages) {
                quickSearchData.scrolling.observer.observe(pageElem);
            }
        }
    },

    quickSearchDisplayModeToggleListener: async function(event) {
        let toggleBtnElem = event.target.closest('[data-qs-mode]');
        if(!toggleBtnElem) {
            throw 'TradeofferWindow.quickSearchDisplayModeToggleListener: mode toggle button not detected???';
        }

        globalSettings.tradeoffer.displayMode = TradeofferWindow.QUICK_SEARCH_MODE_MAP[toggleBtnElem.dataset.qsMode];
        TradeofferWindow.quickSearchDisplaySetup();

        await TradeofferWindow.configSave();
    },
    quickSearchDisplaySetup: function() {
        let { displayMode } = globalSettings.tradeoffer;
        if(displayMode === undefined) {
            TradeofferWindow.quickSearchDisplaySetupPaging();
            // TradeofferWindow.quickSearchDisplaySetupScrolling();
        }

        let { quickSearchShortcuts, quickSearchData, QUICK_SEARCH_MODE_MAP } = TradeofferWindow;
        let currentMode = quickSearchData.mode;
        if(currentMode === undefined || displayMode !== currentMode) {
            if(displayMode === 0) {
                TradeofferWindow.quickSearchDisplaySetupPaging();
            } else if(displayMode === 1) {
                TradeofferWindow.quickSearchDisplaySetupScrolling();
            }
        }

        currentMode = quickSearchData.mode;
        if(!Number.isInteger(currentMode)) {
            throw '';
        }

        let currentModeString = QUICK_SEARCH_MODE_MAP[currentMode];
        for(let toggleElem of quickSearchShortcuts.displayModeToggle.querySelectorAll('[data-qs-mode]')) {
            toggleElem.classList[toggleElem.dataset.qsMode === currentModeString ? 'add' : 'remove']('selected');
        }
    },
    quickSearchDisplaySetupPaging: function() {
        let { quickSearchShortcuts, quickSearchData } = TradeofferWindow;
        let { paging: pagingData, inventory: { pageCount: pageNumLast } } = quickSearchData;

        if(quickSearchData.mode === 0) {
            TradeofferWindow.quickSearchDisplayPopulatePage(quickSearchData.paging.pages.fg, 1);
            TradeofferWindow.quickSearchDisplayUpdatePageNavigationBar(1);
            return;
        }

        if(quickSearchData.mode !== null) {
            // reset non-paging stuff and selections
            if(quickSearchData.mode === 1) {
                let { scrolling: scrollData } = quickSearchData;
                scrollData.observer.disconnect();
                for(let pageElem of scrollData.pages) {
                    pageElem.remove();
                }
                scrollData.pages = [];
                quickSearchShortcuts.display.classList.remove('scrolling');
            }
        }

        quickSearchShortcuts.display.classList.add('paging');
        let pageNum = 1;
        if(quickSearchData.currentPage) {
            pageNum = quickSearchData.currentPage.dataset.page ? parseInt(quickSearchData.currentPage.dataset.page) : 1;
            TradeofferWindow.quickSearchDisplayPopulatePage(quickSearchData.currentPage, pageNum);
            quickSearchShortcuts.pages.prepend(quickSearchData.currentPage);
            quickSearchData.currentPage.classList.add('active');
            pagingData.pages.fg = quickSearchData.currentPage;
        } else {
            // generate 1st page and set active
            let pageFgHTMLString = TradeofferWindow.quickSearchDisplayGeneratePageHTMLString(pageNum);
            quickSearchShortcuts.pages.insertAdjacentHTML('afterbegin', pageFgHTMLString);
            let pageFgElem = quickSearchShortcuts.pages.querySelector('.inventory-page');
            pageFgElem.classList.add('active');
            quickSearchData.currentPage = pageFgElem;
            pagingData.pages.fg = pageFgElem;
        }

        let pageBgHTMLString = TradeofferWindow.quickSearchDisplayGeneratePageHTMLString();
        quickSearchShortcuts.pages.insertAdjacentHTML('afterbegin', pageBgHTMLString);
        let pageBgElem = quickSearchShortcuts.pages.querySelector('.inventory-page:not(.active)');
        pagingData.pages.bg = pageBgElem;
        TradeofferWindow.quickSearchDisplayUpdatePageNavigationBar(pageNum);

        quickSearchData.mode = 0;
    },
    quickSearchDisplaySetupScrolling: function() {
        // WARNING: Need enough pages for scrolling intersection observer to work,
        //          otherwise scrolling can get stuck, or rapid scrolling can occur.
        // WARNING: Need enough root margin so that scrollbar doesnt reach either end,
        //          which results in rapid scrolling to first/last page.
        // WARNING: Need to disconnect observer and reconnect after when abruptly repopulating
        //          pages since hiding pages might trigger an observer target
        let { quickSearchShortcuts, quickSearchData } = TradeofferWindow;
        let { scrolling: scrollData } = quickSearchData;
        let startOffset = Math.floor(scrollData.pageCount/2);

        if(quickSearchData.mode === 1) {
            scrollData.observer.disconnect();
            for(let i=0; i<scrollData.pages.length; i++) {
                TradeofferWindow.quickSearchDisplayPopulatePage(scrollData.pages[i], i+1-startOffset);
            }
            for(let pageElem of scrollData.pages) {
                scrollData.observer.observe(pageElem);
            }
            return;
        }

        if(quickSearchData.mode !== null) {
            // reset non-scrolling stuff and selections
            if(quickSearchData.mode === 0) {
                let { paging: pagingData } = quickSearchData;
                pagingData.pages.fg.classList.remove('active');
                pagingData.pages.fg.remove();
                pagingData.pages.bg.remove();
                pagingData.pages = { fg: null, bg: null };
                quickSearchShortcuts.display.classList.remove('paging');
            }
        }

        quickSearchShortcuts.display.classList.add('scrolling');
        let pageNumCurrent = quickSearchData.currentPage ? parseInt(quickSearchData.currentPage.dataset.page) : null;
        let pagesHTMLString = '';
        for(let i=(pageNumCurrent ?? 1)-startOffset, end=i+scrollData.pageCount; i<end; i++) {
            if(i === pageNumCurrent) {
                pagesHTMLString += quickSearchData.currentPage.outerHTML;
            } else {
                pagesHTMLString += TradeofferWindow.quickSearchDisplayGeneratePageHTMLString(i);
            }
        }
        quickSearchShortcuts.pages.insertAdjacentHTML('afterbegin', pagesHTMLString);

        let pageElemList = quickSearchShortcuts.pages.querySelectorAll('.inventory-page');
        let pageHeight =  pageElemList[startOffset].clientHeight;
        // let pageContainerHeight = quickSearchShortcuts.pages.clientHeight;
        // let observerMargin = (steamToolsUtils.clamp(pageContainerHeight+pageHeight, 1.5*pageHeight, (pageElemList.length-1)*pageHeight) - pageContainerHeight) / 2;
        let observerOptions = {
            root: quickSearchShortcuts.pages,
            rootMargin: '120% 0%',
            threshold: 1.0
        };
        scrollData.observer = new IntersectionObserver(TradeofferWindow.quickSearchDisplayScrollLoadPage, observerOptions);

        for(let page of quickSearchShortcuts.pages.querySelectorAll('.inventory-page')) {
            scrollData.observer.observe(page);
            scrollData.pages.push(page);
        }
        quickSearchData.currentPage = scrollData.pages[startOffset];

        let currentPageNum = parseInt(quickSearchData.currentPage.dataset.page);
        if(currentPageNum > 2) {
            quickSearchShortcuts.pages.scroll(0, startOffset*pageHeight);
        }

        quickSearchData.mode = 1;
    },
    quickSearchDisplayScrollLoadPage: function(entries) {
        let { quickSearchShortcuts, quickSearchData } = TradeofferWindow;
        let { pageCount, pages } = quickSearchData.scrolling;
        let pageHeightWithoutTop = quickSearchData.display.rows * (5.25+0.5);

        for(let entry of entries) {
            if(quickSearchData.mode !== 1) {
                continue;
            } else if(!entry.isIntersecting) {
                continue;
            }

            let pageNum = entry.target.dataset.page;

            if(pages[0].dataset.page === pageNum) {
                let pageElem = pages.pop();
                pageElem.remove();
                TradeofferWindow.quickSearchDisplayPopulatePage(pageElem, parseInt(pageNum)-1);
                quickSearchShortcuts.pages.prepend(pageElem);
                pages.unshift(pageElem);
                quickSearchData.currentPage = quickSearchData.currentPage.previousElementSibling;
                break;
            } else if(pages[pageCount-1].dataset.page === pageNum) {
                let pageElem = pages.shift();
                pageElem.remove();
                TradeofferWindow.quickSearchDisplayPopulatePage(pageElem, parseInt(pageNum)+1);
                quickSearchShortcuts.pages.append(pageElem);
                pages.push(pageElem);
                quickSearchData.currentPage = quickSearchData.currentPage.nextElementSibling;
                break;
            }

            // let pageMargin = Math.max(0, parseInt(pages[0].dataset.page)-1);
            // quickSearchShortcuts.pages.style.paddingTop = pageMargin > 0
            //   ? `${(pageMargin*pageHeightWithoutTop) + 0.5}rem`
            //   : '0rem';
        }
    },
    quickSearchDisplayPaginateListener: function(event) {
        let { mode: currentMode, paging: pagingData, inventory: { pageCount: pageNumLast } } = TradeofferWindow.quickSearchData;
        let pages = pagingData.pages;

        if(currentMode !== 0) {
            return;
        } else if(pagingData.isAnimating) {
            return;
        }

        let paginateElem = event.target.closest('.inventory-page-nav-btn');
        if(!paginateElem) {
            return;
        }

        let pageStep = parseInt(paginateElem.dataset.step);
        if(Number.isNaN(pageStep)) {
            console.error('TradeofferWindow.quickSearchPaginateListener(): Page step is not a number!?!?');
            return;
        } else if(!(pageStep < 0) && !(pageStep > 0)) {
            console.warn('TradeofferWindow.quickSearchPaginateListener(): Page step of 0 is not useful...');
            return;
        }

        let targetPage = steamToolsUtils.clamp(parseInt(pages.fg.dataset.page)+pageStep, 1, Math.max(1, pageNumLast));

        if(targetPage !== pages.bg.dataset.page) {
            TradeofferWindow.quickSearchDisplayPopulatePage(pages.bg, targetPage);
        }

        // start animation setup
        let animationObj1, animationObj2;
        let isPositive = pageStep > 0;
        let exitDirection = isPositive ? 'exitLeft' : 'exitRight';
        let enterDirection = isPositive ? 'enterRight' : 'enterLeft';

        pagingData.isAnimating = true;
        animationObj1 = pages.fg.animate(pagingData.keyframes[exitDirection], pagingData.options);
        animationObj2 = pages.bg.animate(pagingData.keyframes[enterDirection], pagingData.options);
        pagingData.finishAnimation(animationObj2, () => {
            TradeofferWindow.quickSearchDisplayUpdatePageNavigationBar(targetPage);
        });

        pages.fg.classList.remove('active');
        pages.bg.classList.add('active');
        let tmpPage = pages.fg;
        pages.fg = pages.bg;
        pages.bg = tmpPage;
        TradeofferWindow.quickSearchData.currentPage = pages.fg;
    },
    quickSearchDisplayUpdatePageNavigationBar: function(pageNum) {
        let { quickSearchShortcuts } = TradeofferWindow;
        let { pageCount: pageNumLast } = TradeofferWindow.quickSearchData.inventory;
        let pageNumsElem = TradeofferWindow.quickSearchShortcuts.pageNumbers;
        pageNumsElem.querySelector('.number.current').textContent = pageNum;

        // update page numbers
        if(pageNum < 3) {
            if(pageNum <= 1) {
                pageNumsElem.querySelector('.number.previous').classList.add('hidden');
            } else {
                let pagePrevNumElem = pageNumsElem.querySelector('.number.previous');
                pagePrevNumElem.textContent = 1;
                pagePrevNumElem.classList.remove('hidden');
            }
            pageNumsElem.querySelector('.number.first').classList.add('hidden');
            pageNumsElem.querySelector('.ellipsis.first').classList.add('hidden');
        } else {
            pageNumsElem.querySelector('.number.first').classList.remove('hidden');
            pageNumsElem.querySelector('.ellipsis.first').classList.remove('hidden');
            let pagePrevNumElem = pageNumsElem.querySelector('.number.previous');
            pagePrevNumElem.textContent = pageNum-1;
            pagePrevNumElem.classList.remove('hidden');
        }
        if(pageNumLast-pageNum < 2) {
            if(pageNum >= pageNumLast) {
                pageNumsElem.querySelector('.number.next').classList.add('hidden');
            } else {
                let pageNextNumElem = pageNumsElem.querySelector('.number.next');
                pageNextNumElem.textContent = pageNumLast;
                pageNextNumElem.classList.remove('hidden');
            }
            pageNumsElem.querySelector('.number.last').classList.add('hidden');
            pageNumsElem.querySelector('.ellipsis.last').classList.add('hidden');
        } else {
            pageNumsElem.querySelector('.number.last').classList.remove('hidden');
            pageNumsElem.querySelector('.ellipsis.last').classList.remove('hidden');
            let pageNextNumElem = pageNumsElem.querySelector('.number.next');
            pageNextNumElem.textContent = pageNum+1;
            pageNextNumElem.classList.remove('hidden');
        }

        // update button disability
        let navBtnElems = quickSearchShortcuts.pageNavigationBar.querySelectorAll('.inventory-page-nav-btn[data-step^="-"]');
        for(let navBtnElem of navBtnElems) {
            navBtnElem.disabled = pageNum <= 1;
        }

        navBtnElems = quickSearchShortcuts.pageNavigationBar.querySelectorAll('.inventory-page-nav-btn:not([data-step^="-"])');
        for(let navBtnElem of navBtnElems) {
            navBtnElem.disabled = pageNum >= pageNumLast;
        }
    },
    quickSearchDisplayGeneratePageHTMLString: function(pageNum) {
        console.warn('TradeofferWindow.quickSearchDisplayGeneratePageHTMLString(): WIP');

        let { quickSearchData } = TradeofferWindow;
        let { inventory } = quickSearchData;

        if(pageNum < 1 || pageNum > inventory.pageCount) {
            return `<div class="inventory-page hidden" data-page="0">`
              +     'END'
              + '</div>';
        }

        let rowsHTMLString = '';
        let pageItemCount = quickSearchData.display.rows * quickSearchData.display.columns;
        let startRowIndex = (pageNum-1) * pageItemCount;
        let lastRowIndex = Math.min(startRowIndex+pageItemCount, inventory.dataListFiltered.length);
        for(let i=startRowIndex; i<lastRowIndex; i+=quickSearchData.display.columns) {
            rowsHTMLString += TradeofferWindow.quickSearchRowGenerateHTMLString(i);
        }

        return `<div class="inventory-page" data-page="${pageNum}">`
          +     rowsHTMLString
          + '</div>';
    },
    quickSearchRowGenerateHTMLString: function(startIndex) {
        let { quickSearchData } = TradeofferWindow;

        let itemsHTMLString = '';
        let lastIndex = Math.min(startIndex+quickSearchData.display.columns, quickSearchData.inventory.dataListFiltered.length);
        for(let i=startIndex; i<lastIndex; i++) {
            itemsHTMLString += TradeofferWindow.quickSearchItemGenerateHTMLString(quickSearchData.inventory.dataListFiltered[i]);
        }

        return '<div class="inventory-page-row">'
          +     itemsHTMLString
          + '</div>';
    },
    quickSearchItemGenerateHTMLString: function(itemData) {
        let { inventory } = TradeofferWindow.quickSearchData;
        let descript = inventory.descriptions[`${itemData.classid}_${itemData.instanceid}`];

        let styleAttrString = '';
        styleAttrString += descript.name_color ? ` border-color: #${descript.name_color};` : '';
        styleAttrString += descript.background_color ? ` background-color: #${descript.background_color};` : '';
        if(styleAttrString.length) {
            styleAttrString = ` style="${styleAttrString}"`;
        }

        let dataAttrString = '';
        dataAttrString += ` data-id="${itemData.id}"`;
        if(parseInt(itemData.amount) > 1) {
            dataAttrString += ` data-amount="${parseInt(itemData.amount).toLocaleString()}"`;
        }

        let imgUrl = descript.icon_url ? `https://community.akamai.steamstatic.com/economy/image/${descript.icon_url}/96fx96f` : '';
        let classStringDisabled = inventory.disabledItems.has(itemData.id) ? ' disabled' : '';
        let classStringSelected = inventory.selectedItems.has(itemData.id) ? ' selected' : '';
        return `<div class="inventory-item-container${classStringDisabled}${classStringSelected}" title="${descript.name}"${dataAttrString}${styleAttrString}>`
          +     (imgUrl ? `<img loading="lazy" src="${imgUrl}">` : descript.name)
          + '</div>';
    },
    quickSearchDisplayPopulatePage: function(pageElem, pageNum) {
        console.warn('TradeofferWindow.quickSearchPopulatePage(): WIP');

        let { quickSearchData } = TradeofferWindow;
        let { inventory } = quickSearchData;

        if(quickSearchData.mode === 1 && (pageNum < 1 || pageNum > inventory.pageCount)) {
            pageElem.classList.add('hidden');
            pageElem.dataset.page = '0';
            pageElem.innerHTML = 'END';
            return;
        } else {
            pageElem.classList.remove('hidden');
            if(pageElem.innerHTML === 'END') {
                pageElem.innerHTML = '';
            }
        }

        TradeofferWindow.quickSearchDisplayPageReset(pageElem);

        let pageItemCount = quickSearchData.display.rows * quickSearchData.display.columns;
        let itemIndex = (pageNum-1) * pageItemCount;
        let lastIndex = Math.min(itemIndex+pageItemCount, inventory.dataListFiltered.length);
        let rowElemList = pageElem.querySelectorAll('.inventory-page-row');
        let rowsNeeded = Math.min(Math.ceil((lastIndex-itemIndex)/quickSearchData.display.columns), quickSearchData.display.rows) - rowElemList.length;

        for(let rowElem of rowElemList) {
            if(itemIndex >= lastIndex) {
                break;
            }

            let itemElemList = rowElem.querySelectorAll('.inventory-item-container');
            let containersNeeded = Math.min(lastIndex-itemIndex, quickSearchData.display.columns) - itemElemList.length;

            for(let itemElem of itemElemList) {
                if(itemIndex >= lastIndex) {
                    break;
                }

                TradeofferWindow.quickSearchItemUpdateElement(itemElem, inventory.dataListFiltered[itemIndex++]);
            }

            if(containersNeeded < 0) {
                for(; containersNeeded; containersNeeded++) {
                    itemElemList[itemElemList.length+containersNeeded].remove();
                }
            } else if(containersNeeded > 0) {
                let itemsHTMLString = '';
                while(containersNeeded--) {
                    itemsHTMLString += TradeofferWindow.quickSearchItemGenerateHTMLString(inventory.dataListFiltered[itemIndex++]);
                }
                rowElem.insertAdjacentHTML('beforeend', itemsHTMLString);
            }
        }

        if(rowsNeeded < 0) {
            for(; rowsNeeded; rowsNeeded++) {
                rowElemList[rowElemList.length+rowsNeeded].remove();
            }
        } else if(rowsNeeded > 0) {
            let rowsHTMLString = '';
            while(rowsNeeded--) {
                rowsHTMLString += TradeofferWindow.quickSearchRowGenerateHTMLString(itemIndex);
                itemIndex += quickSearchData.display.columns;
            }
            pageElem.insertAdjacentHTML('beforeend', rowsHTMLString);
        }

        pageElem.dataset.page = pageNum;
    },
    quickSearchItemUpdateElement: function(itemElem, itemData) {
        let { inventory } = TradeofferWindow.quickSearchData;
        let descript = inventory.descriptions[`${itemData.classid}_${itemData.instanceid}`];

        itemElem.dataset.id = itemData.id;
        if(parseInt(itemData.amount) > 1) {
            itemElem.dataset.amount = parseInt(itemData.amount).toLocaleString();
        } else {
            delete itemElem.dataset.amount;
        }
        itemElem.title = descript.name;
        itemElem.classList[ inventory.disabledItems.has(itemData.id) ? 'add' : 'remove' ]('disabled');
        itemElem.classList[ inventory.selectedItems.has(itemData.id) ? 'add' : 'remove' ]('selected');
        let imgElem = itemElem.querySelector('img');
        if(imgElem) {
            imgElem.src = descript.icon_url
              ? `https://community.akamai.steamstatic.com/economy/image/${descript.icon_url}/96fx96f`
              : 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        } else {
            let newImgElem = new Image();
            newImgElem.src = descript.icon_url
              ? `https://community.akamai.steamstatic.com/economy/image/${descript.icon_url}/96fx96f`
              : 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
            itemElem.prepend(newImgElem);
        }

        let styleString = '';
        styleString += descript.name_color ? ` border-color: #${descript.name_color};` : '';
        styleString += descript.background_color ? ` background-color: #${descript.background_color};` : '';
        itemElem.style.cssText = styleString;
    },
    quickSearchDisplayPageReset: function(pageElem) {
        let selectData = TradeofferWindow.quickSearchData.select;

        let itemElemList = pageElem.querySelectorAll('.inventory-item-container');
        for(let itemElem of itemElemList) {
            if(selectData.lastSelected?.dataset.id === itemElem.dataset.id) {
                selectData.lastSelected = null;
            }

            for(let key in itemElem.dataset) {
                delete itemElem.dataset[key];
            }
            itemElem.removeAttribute('style');
            itemElem.removeAttribute('title');
            itemElem.innerHTML = '';
        }

        delete pageElem.dataset.page;
    },





    itemsSelectorShortcuts: {},
    itemsSelectorData: {
        groupBarterEntries: [
            {
                name: 'Sacks of Gems',
                items: [
                    { appid: '753', contextid: '6', classid: '667933237', amount: 1 }
                ]
            },
            {
                name: 'Gem',
                items: [
                    { appid: '753', contextid: '6', classid: '667924416', amount: 1 }
                ]
            },
            {
                name: 'TF2 Key',
                items: [
                    { appid: '440', contextid: '2', classid: '101785959', amount: 1 }
                ]
            },
            {
                name: 'Refined Metal',
                items: [
                    { appid: '440', contextid: '2', classid: '2674', amount: 1 }
                ]
            },
            {
                name: 'Reclaimed Metal',
                items: [
                    { appid: '440', contextid: '2', classid: '5564', amount: 1 }
                ]
            },
            {
                name: 'Scrap Metal',
                items: [
                    { appid: '440', contextid: '2', classid: '2675', amount: 1 }
                ]
            },
        ],
        currentProfileid: null, // profileid
        currentGroupId: null, // group.id
        currentEntryId: null, // entry.id
        groups: {
        /*    groupId: {
         *        name: string,
         *        id: number,
         *        entries: [
         *            {
         *                name: string,
         *                id: number,
         *                items: [
         *                    { appid: string, contextid: string, classid: string, instanceid: string, amount: number },
         *                    ...
         *                ]
         *            },
         *            ...
         *        ]
         *    },
         *    ...
         */
        },
        balancer: {
            RARITY_MAP: {
                card: ['Normal', 'Foil'],
                background: ['Common', 'Uncommon', 'Rare'],
                emoticon: ['Common', 'Uncommon', 'Rare'],
            },
            APP_NAME_MAP: {
                // appid: string
            },
            data: {
                /* profileid(obj) -> itemType(obj) -> rarity(arr) -> appid(obj) -> classid(arr)
                 * profileid: {
                 *     card: [
                 *         {
                 *             appid: [
                 *                 { classid: string, tradables: [], count: number }
                 *             ]
                 *         },
                 *         ...,
                 *     ],
                 *     background: [ {}, {}, {} ],
                 *     emoticon: [ {}, {}, {}]
                 *     ...
                 * }
                 */
            },
            // results: // generated from item matching method
        }
    },

    itemsSelectorSetup: function() {
        console.log('Items Selector WIP');

        let { itemsSelectorShortcuts } = TradeofferWindow;

        if(itemsSelectorShortcuts.body !== undefined) {
            itemsSelectorShortcuts.dialogContainer.classList.remove('active');
            TradeofferWindow.itemsSelectorRecalculateAvailability();
            TradeofferWindow.itemsSelectorRecalculateBalancerAvailability();
            return;
        }

        // generate prefilter body and attach to overlay body
        const itemsSelectorDialogHTMLString = '<div class="items-selector-dialog-container">'
          +     '<div class="items-selector-dialog">'
          +         '<div class="items-selector-entry-remove">'
          +         '</div>'
          +         '<div class="dialog-profile">'
          +             '<img class="dialog-profile-avatar" src="">'
          +             '<span class="dialog-profile-name">?????</span>'
          +         '</div>'
          +         '<div class="dialog-title">'
          +             '[<span class="dialog-group-name">?????</span>] '
          +             '<span class="dialog-entry-name">?????</span>'
          +         '</div>'
          +         '<div class="dialog-items">'
          +             '' // item container elems
          +         '</div>'
          +         '<input type="range" name="" class="userscript-input" value="0" min="0" max="0">'
          +         '<div>'
          +             'Select'
          +             '<input type="number" name="" class="userscript-input" value="0" min="0" max="0">'
          +             'Sets of Items'
          +         '</div>'
          +         '<div class="dialog-actions">'
          +             '<button class="dialog-cancel userscript-btn red">Cancel</button>'
          +             '<button class="dialog-reset userscript-btn trans-white">Reset</button>'
          +             '<button class="dialog-confirm userscript-btn green">Apply</button>'
          +             '<button class="dialog-check userscript-btn purple">Check Availability</button>'
          +         '</div>'
          +     '</div>'
          + '</div>';

        const itemsSelectorBodyHTMLString = '<div class="items-selector-body">'
          +     '<div class="items-selector-main-control">'
          +         TradeofferWindow.generateProfileSelectorHTMLString({ id: 'selector-items-selector-profile' })
          +     '</div>'
          +     '<div class="items-selector-groups">'
          +         '' // dynamically populate groups later
          +     '</div>'
          +     itemsSelectorDialogHTMLString
          + '</div>';

        TradeofferWindow.shortcuts.overlayBody.insertAdjacentHTML('beforeend', itemsSelectorBodyHTMLString);

        // add shortcuts
        itemsSelectorShortcuts.body = TradeofferWindow.shortcuts.overlayBody.querySelector('.items-selector-body');
        itemsSelectorShortcuts.groups = itemsSelectorShortcuts.body.querySelector('.items-selector-groups');
        itemsSelectorShortcuts.group = {}; // populated during group loading later
        itemsSelectorShortcuts.selector = document.getElementById('selector-items-selector-profile');
        itemsSelectorShortcuts.selectorOptions = itemsSelectorShortcuts.selector.querySelector('.main-control-selector-options');
        itemsSelectorShortcuts.dialogContainer = itemsSelectorShortcuts.body.querySelector('.items-selector-dialog-container');
        itemsSelectorShortcuts.dialog = itemsSelectorShortcuts.dialogContainer.querySelector('.items-selector-dialog');
        itemsSelectorShortcuts.dialogTitle = itemsSelectorShortcuts.dialog.querySelector('.dialog-title');
        itemsSelectorShortcuts.dialogProfile = itemsSelectorShortcuts.dialog.querySelector('.dialog-profile');
        itemsSelectorShortcuts.dialogItems = itemsSelectorShortcuts.dialog.querySelector('.dialog-items');
        itemsSelectorShortcuts.dialogSliderInput = itemsSelectorShortcuts.dialog.querySelector('input[type="range"]');
        itemsSelectorShortcuts.dialogTextInput = itemsSelectorShortcuts.dialog.querySelector('input[type="number"]');
        itemsSelectorShortcuts.dialogButtonCancel = itemsSelectorShortcuts.dialog.querySelector('.dialog-cancel');
        itemsSelectorShortcuts.dialogButtonReset = itemsSelectorShortcuts.dialog.querySelector('.dialog-reset');
        itemsSelectorShortcuts.dialogButtonConfirm = itemsSelectorShortcuts.dialog.querySelector('.dialog-confirm');
        itemsSelectorShortcuts.dialogButtonCheck = itemsSelectorShortcuts.dialog.querySelector('.dialog-check');

        // add event listeners
        itemsSelectorShortcuts.selector.addEventListener('click', TradeofferWindow.selectorMenuToggleListener);
        itemsSelectorShortcuts.selectorOptions.addEventListener('click', TradeofferWindow.itemsSelectorSelectorProfileSelectListener);

        itemsSelectorShortcuts.dialog.querySelector('.items-selector-entry-remove').addEventListener('click', TradeofferWindow.itemsSelectorGroupEntryDialogDeleteEntryListener);
        itemsSelectorShortcuts.dialogButtonCancel.addEventListener('click', TradeofferWindow.itemsSelectorGroupEntryDialogCancelListener);
        itemsSelectorShortcuts.dialogButtonReset.addEventListener('click', TradeofferWindow.itemsSelectorGroupEntryDialogResetListener);
        itemsSelectorShortcuts.dialogButtonConfirm.addEventListener('click', TradeofferWindow.itemsSelectorGroupEntryDialogConfirmListener);
        itemsSelectorShortcuts.dialogButtonCheck.addEventListener('click', TradeofferWindow.itemsSelectorGroupEntryDialogCheckAvailabilityListener);
        itemsSelectorShortcuts.dialogSliderInput.addEventListener('input', TradeofferWindow.itemsSelectorGroupEntryDialogUpdateTextListener);
        itemsSelectorShortcuts.dialogTextInput.addEventListener('input', TradeofferWindow.itemsSelectorGroupEntryDialogUpdateSliderListener);

        TradeofferWindow.itemsSelectorLoadGroups();
    },
    itemsSelectorLoadGroups: function() {
        const addGroup = (groupid, name, entries = [], options = { sort: true }) => {
            entries = steamToolsUtils.deepClone(entries);

            // position in original dataset
            for(let i=0; i<entries.length; i++) {
                entries[i].pos = i;
            }

            if(options.sort) {
                entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
            }

            // position in sorted dataset
            for(let i=0; i<entries.length; i++) {
                entries[i].id = i;
            }

            let newGroup = {
                name: name,
                id: groupid,
                entries: entries
            }

            itemsSelectorData.groups[groupid] = newGroup;

            let groupHTMLString = TradeofferWindow.itemsSelectorGenerateGroup(newGroup);
            itemsSelectorShortcuts.groups.insertAdjacentHTML('beforeend', groupHTMLString);
            itemsSelectorShortcuts.group[groupid] = itemsSelectorShortcuts.groups.lastElementChild;
        };

        let { data, itemsSelectorShortcuts, itemsSelectorData } = TradeofferWindow;

        addGroup('custom', 'Custom', globalSettings.tradeoffer.itemsSelectorCustomGroupEntries);

        addGroup('barter', 'Barter Items', itemsSelectorData.groupBarterEntries, { sort: false });

        addGroup('cardSets', 'Steam Card Sets');
        let cardSetButtonsHTMLString = `<button class="userscript-trade-action half" data-id="${data.me.id}">Check My Inventory</button>`
            + `<button class="userscript-trade-action half" data-id="${data.them.id}">Check Their Inventory</button>`;
        itemsSelectorShortcuts.group.cardSets.querySelector('.group-entries').insertAdjacentHTML('beforebegin', cardSetButtonsHTMLString);
        itemsSelectorShortcuts.group.cardSets.querySelector(`button[data-id="${data.me.id}"]`).addEventListener('click', TradeofferWindow.itemsSelectorGroupCardSetsEntriesAdd, { once: true });
        itemsSelectorShortcuts.group.cardSets.querySelector(`button[data-id="${data.them.id}"]`).addEventListener('click', TradeofferWindow.itemsSelectorGroupCardSetsEntriesAdd, { once: true });

        addGroup('balancer', 'Steam Items Balancer');
        let balancerButtonHTMLString = '<button id="items-selector-add-balancing" class="userscript-trade-action">Balance Steam Items</button>';
        itemsSelectorShortcuts.group.balancer.querySelector('.group-entries').insertAdjacentHTML('beforebegin', balancerButtonHTMLString);
        document.getElementById('items-selector-add-balancing').addEventListener('click', TradeofferWindow.itemsSelectorGroupBalancerEntriesAdd, { once: true });

        for(let groupName in itemsSelectorShortcuts.group) {
            itemsSelectorShortcuts.group[groupName].addEventListener('click', TradeofferWindow.itemsSelectorGroupEntryDialogShowListener);
            itemsSelectorShortcuts.group[groupName].querySelector('.items-selector-group-header').addEventListener('click', TradeofferWindow.itemsSelectorGroupToggle);
        }

        TradeofferWindow.itemsSelectorRecalculateAvailability();
    },
    itemsSelectorSelectorProfileSelectListener: function(event) {
        // set selector select contents
        let optionElem = event.target.closest('.main-control-selector-option');
        if(!optionElem) {
            throw 'TradeofferWindow.itemsSelectorSelectorProfileSelectListener(): No option found! Was the document structured correctly?';
        }

        let selectorElem = event.currentTarget.parentElement;
        if(selectorElem.dataset.id !== optionElem.dataset.id) {
            TradeofferWindow.selectorMenuSelect(selectorElem, optionElem);
            TradeofferWindow.itemsSelectorData.currentProfileid = optionElem.dataset.id;
        }

        TradeofferWindow.itemsSelectorRecalculateAvailability();
    },
    itemsSelectorGroupToggle: function(event) {
        let groupElem = event.target.closest('.items-selector-group');

        groupElem.classList.toggle('hidden');
    },
    itemsSelectorRecalculateAvailability: function(excludeGroupId) {
        let { group: groupElemList } = TradeofferWindow.itemsSelectorShortcuts;

        for(let groupId in groupElemList) {
            if(groupId === 'balancer' || groupId === excludeGroupId) {
                continue;
            }

            for(let entryElem of groupElemList[groupId].querySelectorAll('.items-selector-entry')) {
                // NOTE: micro-optimization: check if any profile is selected
                let availability = TradeofferWindow.itemsSelectorGroupEntryCheckAvailability(entryElem);
                if(availability === '') {
                    entryElem.classList.remove('uncertain', 'available', 'unavailable');
                    continue;
                } else if(entryElem.classList.contains(availability)) {
                    continue;
                }

                entryElem.classList.remove('uncertain', 'available', 'unavailable');
                entryElem.classList.add(availability);
            }
        }
    },
    itemsSelectorGroupEntryCheckAvailability: function(entry) {
        let { data, offerData: { offer }, itemsSelectorData } = TradeofferWindow;

        if(!itemsSelectorData.currentProfileid) {
            return '';
        }

        if(entry instanceof HTMLElement) {
            let entryId = entry.dataset.id;
            let groupId = entry.closest('.items-selector-group').dataset.id;
            entry = itemsSelectorData.groups[groupId]?.entries[entryId];
            if(!entry) {
                throw 'TradeofferWindow.itemsSelectorGroupEntryCheckAvailability(): No entry data found?!?!';
            }
        }

        if(steamToolsUtils.isSimplyObject(entry)) {
            entry.maxAvailable ??= {};

            let maxAvailable = Number.MAX_SAFE_INTEGER;
            for(let item of entry.items) {
                let descriptContext = data.descriptionClassAssets[itemsSelectorData.currentProfileid]?.[item.appid]?.[item.contextid];
                if(!descriptContext) {
                    entry.maxAvailable[itemsSelectorData.currentProfileid] = null;
                    return 'uncertain';
                }

                let descriptEntryCount = item.instanceid
                  ? descriptContext[item.classid]?.instanceCounts[item.instanceid]
                  : descriptContext[item.classid]?.count;

                if(descriptEntryCount === undefined || descriptEntryCount === 0) {
                    entry.maxAvailable[itemsSelectorData.currentProfileid] = 0;
                    return 'unavailable';
                }

                let offerContext = offer[itemsSelectorData.currentProfileid]?.[item.appid]?.[item.contextid];
                let offerEntryCount = item.instanceid
                  ? offerContext?.[item.classid]?.instanceCounts[item.instanceid]
                  : offerContext?.[item.classid]?.count;
                let availableAssets = descriptEntryCount - (offerEntryCount ?? 0);
                if(availableAssets < parseInt(item.amount)) {
                    entry.maxAvailable[itemsSelectorData.currentProfileid] = 0;
                    return 'unavailable';
                }

                maxAvailable = Math.min(maxAvailable, Math.floor(availableAssets / item.amount));
            }

            entry.maxAvailable[itemsSelectorData.currentProfileid] = maxAvailable;
            return 'available';
        }

        return '';
    },
    itemsSelectorRecalculateBalancerAvailability: function() {
        let { itemsSelectorShortcuts, itemsSelectorData } = TradeofferWindow;

        let balancerGroupElem = itemsSelectorShortcuts?.group.balancer;
        if(!balancerGroupElem) {
            return;
        }

        let balancerGroupData = itemsSelectorData.groups.balancer;
        if(!balancerGroupData) {
            return;
        }

        for(let entryElem of balancerGroupElem.querySelectorAll('.items-selector-entry')) {
            let isAvailable = TradeofferWindow.itemsSelectorGroupBalancerCheckAvailability(entryElem);
            entryElem.classList.remove(isAvailable ? 'unavailable' : 'available');
            entryElem.classList.add(isAvailable ? 'available' : 'unavailable');
        }
    },
    itemsSelectorGroupBalancerCheckAvailability: function(entry) {
        const checkIsAvailabile = (items, descriptContext, offerContext) => {
            for(let item of items) {
                let descriptCount = descriptContext[item.classid]?.count ?? 0;
                let offerCount = offerContext?.[item.classid]?.count ?? 0;
                let totalAvailable = descriptCount - offerCount;
                if(totalAvailable < parseInt(item.amount)) {
                    return false;
                }
            }

            return true;
        };

        let { data, offerData: { offer }, itemsSelectorData } = TradeofferWindow;

        let descriptSteamContext1 = data.descriptionClassAssets[data.me.id]?.['753']?.['6'];
        let descriptSteamContext2 = data.descriptionClassAssets[data.them.id]?.['753']?.['6'];
        if(!descriptSteamContext1 || !descriptSteamContext2) {
            console.error('TradeofferWindow.itemsSelectorGroupBalancerCheckAvailability(): At least 1 of the steam inventories is not present!?!?');
            entry.isAvailable = false;
            return entry.isAvailable;
        }

        if(entry instanceof HTMLElement) {
            let entryId = entry.dataset.id;
            entry = itemsSelectorData.groups.balancer?.entries[entryId];
            if(!entry) {
                throw 'TradeofferWindow.itemsSelectorGroupBalancerCheckAvailability(): No entry data found?!?!';
            }
        }

        let offerSteamContext1 = offer[data.me.id]?.['753']?.['6'];
        let offerSteamContext2 = offer[data.them.id]?.['753']?.['6'];

        if(steamToolsUtils.isSimplyObject(entry)) {
            entry.isAvailable = checkIsAvailabile(entry.items1, descriptSteamContext1, offerSteamContext1)
                && checkIsAvailabile(entry.items2, descriptSteamContext2, offerSteamContext2);
            return entry.isAvailable;
        }

        return false;
    },

    itemsSelectorGroupCustomEntryAdd: function(name, itemList) {
        // itemList: [ { appid, contextid, classid, instanceid, amount }, ... ]

        let { custom: groupCustomData } = TradeofferWindow.itemsSelectorData.groups;

        if(typeof name !== 'string' || !Array.isArray(itemList)) {
            throw 'TradeofferWindow.itemsSelectorAddCustomGroupEntry(): invalid arg types!';
        }

        let newEntry = {
            name: name,
            id: groupCustomData.entries.length,
            items: itemList.map(item => {
                if(!steamToolsUtils.isSimplyObject(item)) {
                    throw 'TradeofferWindow.itemsSelectorAddCustomGroupEntry(): invalid item object! Group entry will not be added...';
                }

                return {
                    appid: item.appid,
                    contextid: item.contextid,
                    classid: item.classid,
                    instanceid: item.instanceid,
                    amount: item.amount
                };
            }),
        };

        groupCustomData.entries.push(newEntry);

        let { itemsSelectorShortcuts } = TradeofferWindow;
        if(itemsSelectorShortcuts.body === undefined) {
            return;
        }

        let entryHTMLString = TradeofferWindow.itemsSelectorGenerateGroupEntry(newEntry);
        itemsSelectorShortcuts.group.custom.insertAdjacentHTML('beforeend', entryHTMLString);
    },
    itemsSelectorGroupCustomEntryRemove: function() {
        // get custom entry's group id and entry id, grab pos(ition) and delete from original custom entries list
    },
    itemsSelectorGroupCardSetsEntriesAdd: async function(event) {
        let { data, itemsSelectorShortcuts, itemsSelectorData } = TradeofferWindow;

        if(itemsSelectorShortcuts.body === undefined) {
            throw 'TradeofferWindow.itemsSelectorGroupCardSetsEntriesAdd(): This method executed before Items Selector has been set up!';
        }

        itemsSelectorShortcuts.group.cardSets.classList.add('loading');

        let profileid = event.target.dataset.id;
        let steamInventory = data.inventories[profileid]?.['753']?.['6'];
        if(!steamInventory) {
            steamInventory = await TradeofferWindow.getTradeInventory(profileid, 753, 6, TradeofferWindow.filterInventoryBlockSetup());
            TradeofferWindow.itemsSelectorRecalculateAvailability();
        }

        let cardAppsTracker = {};
        for(let classInstance in steamInventory.rgDescriptions) {
            let descript = steamInventory.rgDescriptions[classInstance];
            let isCard = descript.tags?.some(x => x.category === 'item_class' && x.internal_name === 'item_class_2') ?? false;
            if(!isCard) {
                continue;
            }

            let cardborder = descript.tags?.find(x => x.category === 'cardborder');
            if(!cardborder) {
                console.warn('TradeofferWindow.itemsSelectorGroupCardSetsEntriesAdd(): Cardborder not found for card tag?!?!');
                continue;
            }
            cardborder = cardborder.internal_name.replace('cardborder_', '');

            let appFoilLabel = `${descript.market_fee_app}_${cardborder}`;
            cardAppsTracker[appFoilLabel] ??= [];
            // NOTE: Assumption: all distinct cards have the same classids
            if(!cardAppsTracker[appFoilLabel].some(x => x.classid === descript.classid)) {
                cardAppsTracker[appFoilLabel].push(descript);
            }
        }

        let entries = [];
        for(let appidCardborder in cardAppsTracker) {
            let [ appid, cardborder ] = appidCardborder.split('_');

            if(cardAppsTracker[appidCardborder].length < 5) {
                continue;
            }

            let appData = await Profile.findAppMetaData(appid, { cards: true, foil: cardborder === '1' });
            if(!appData?.cards) {
                console.error('TradeofferWindow.itemsSelectorGroupCardSetsEntriesAdd(): Cards info not found in meta data?!?!', appid);
                continue;
            }

            if(appData.cards.length === cardAppsTracker[appidCardborder].length) {
                let tmpDescript = cardAppsTracker[appidCardborder][0];
                let appName = tmpDescript.tags.find(x => x.category === 'Game')?.name;
                appName ??= `⁇ (App ${tmpDescript.tags.market_fee_app})`;
                appName = cardborder === '1' ? '★ '+appName : appName;

                let imgMissCount = 0;
                let entryItems = cardAppsTracker[appidCardborder].reduce((newItems, descript) => {
                    let cardIndex = appData.cards.findIndex(x => x[`img_card${cardborder}`] === descript.icon_url);
                    if(cardIndex === -1) {
                        console.warn('TradeofferWindow.itemsSelectorGroupCardSetsEntriesAdd(): No matching card image found with description image!', appid);
                        cardIndex = cardAppsTracker[appidCardborder].length + imgMissCount;
                        imgMissCount++;
                    }
                    newItems[cardIndex] = {
                        appid: '753',
                        contextid: '6',
                        classid: descript.classid,
                        amount: 1
                    }

                    return newItems;
                }, []);

                // NOTE: We can naively filter this way because we are dealing with objects only!
                entries.push({
                    name: appName,
                    items: entryItems.filter(x => x)
                });
            }
        }

        // NOTE: Inefficient?
        entries.sort((a, b) => {
            if(a.name.startsWith('★ ⁇ ')) {
                if(b.name.startsWith('★ ⁇ ')) {
                    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
                } else {
                    return 1;
                }
            } else if(a.name.startsWith('★ ')) {
                if(b.name.startsWith('★ ⁇ ')) {
                    return -1;
                } else if(b.name.startsWith('★ ')) {
                    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
                } else {
                    return 1;
                }
            } else {
                if(b.name.startsWith('★ ')) {
                    return -1;
                } else {
                    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
                }
            }
        });

        let mergedEntries = [];
        let newEntryIndex = 0;
        let entryList = itemsSelectorData.groups.cardSets.entries;
        let entryElemList = itemsSelectorShortcuts.group.cardSets.querySelectorAll('.items-selector-entry');
        if(entryList.length !== entryElemList.length) {
            throw 'TradeofferWindow.itemsSelectorGroupCardSetsEntriesAdd(): Entry list length and element list length mismatch!';
        }

        for(let i=0; i<entryList.length; i++) {
            let currEntry = entryList[i];
            let currEntryElem = entryElemList[i];
            if(currEntry.id !== parseInt(currEntryElem.dataset.id)) {
                throw 'TradeofferWindow.itemsSelectorGroupCardSetsEntriesAdd(): Entry data id does not match element\'s id!';
            }

            while(newEntryIndex<entries.length && entries[newEntryIndex].name.localeCompare(currEntry.name, undefined, { sensitivity: 'base' })<0) {
                let newEntry = entries[newEntryIndex];

                newEntry.id = mergedEntries.length;
                mergedEntries.push(newEntry);

                let entryHTMLString = TradeofferWindow.itemsSelectorGenerateGroupEntry(newEntry);
                currEntryElem.insertAdjacentHTML('beforebegin', entryHTMLString);

                newEntryIndex++;
            }

            if(newEntryIndex<entries.length && entries[newEntryIndex].name.localeCompare(currEntry.name, undefined, { sensitivity: 'base' }) === 0) {
                newEntryIndex++;
            }

            currEntryElem.dataset.id = currEntry.id = mergedEntries.length;
            mergedEntries.push(currEntry);
        }

        let entriesHTMLString = '';
        while(newEntryIndex<entries.length) {
            let newEntry = entries[newEntryIndex];

            newEntry.id = mergedEntries.length;
            mergedEntries.push(newEntry);

            entriesHTMLString += TradeofferWindow.itemsSelectorGenerateGroupEntry(newEntry);

            newEntryIndex++;
        }
        itemsSelectorShortcuts.group.cardSets.querySelector('.group-entries').insertAdjacentHTML('beforeend', entriesHTMLString);;
        itemsSelectorData.groups.cardSets.entries = mergedEntries;

        event.target.remove();
        itemsSelectorShortcuts.group.cardSets.querySelector('button')?.classList.remove('half');

        TradeofferWindow.itemsSelectorRecalculateAvailability('cardSets');

        itemsSelectorShortcuts.group.cardSets.classList.remove('loading');
    },
    itemsSelectorGroupBalancerEntriesAdd: async function(event) {
        let { data, itemsSelectorShortcuts, itemsSelectorData } = TradeofferWindow;

        if(itemsSelectorShortcuts.body === undefined) {
            throw 'TradeofferWindow.itemsSelectorGroupBalancerEntriesAdd(): This method executed before Items Selector has been set up!';
        }

        let { RARITY_MAP, APP_NAME_MAP } = itemsSelectorData.balancer;

        itemsSelectorShortcuts.group.balancer.classList.add('loading');

        let matchResults = await TradeofferWindow.itemsSelectorGroupBalancerMatchSteamItems();

        // generate entries
        let entries = [];
        let inventoryData1 = itemsSelectorData.balancer.data[data.me.id];
        let inventoryData2 = itemsSelectorData.balancer.data[data.them.id];
        for(let [result, appid, rarity, itemType] of TradeofferWindow.itemsSelectorItemSetsIter(matchResults)) {
            let { swap } = result;

            let items1 = [];
            let items2 = [];
            for(let i=0; i<swap.length; i++) {
                let classData, inventory, itemList;
                if(swap[i] < 0) {
                    classData = inventoryData1[itemType][rarity][appid];
                    inventory = data.inventories[data.me.id]['753']['6'];
                    itemList = items1;
                } else if(swap[i] > 0) {
                    classData = inventoryData2[itemType][rarity][appid];
                    inventory = data.inventories[data.them.id]['753']['6'];
                    itemList = items2;
                } else {
                    continue;
                }

                itemList.push({
                    appid: '753',
                    contextid: '6',
                    classid: classData[i].classid,
                    amount: Math.abs(swap[i])
                });
            }

            let name = `[${RARITY_MAP[itemType][rarity].charAt(0).toUpperCase()}]`;
            name += `[${itemType.charAt(0).toUpperCase()}]`;
            name +=  APP_NAME_MAP[appid] ? ` ${APP_NAME_MAP[appid]}` : ` (App ${appid})`;

            entries.push({
                name: name,
                id: entries.length,
                itemType: itemType,
                rarity: rarity,
                items1: items1,
                items2: items2,
            });
        }

        itemsSelectorData.groups.balancer.entries = entries;

        // generate and insert HTML string
        let balancerGroupElem = itemsSelectorShortcuts.group.balancer;

        let resultsHTMLString = '';
        for(let entryData of entries) {
            resultsHTMLString += TradeofferWindow.itemsSelectorGenerateBalancerEntry(entryData);
        }
        balancerGroupElem.querySelector('.group-entries').insertAdjacentHTML('beforeend', resultsHTMLString);

        // replace current button with 3 buttons
        balancerGroupElem.querySelector('#items-selector-add-balancing').remove();
        let addButtonsHTMLString = '<button id="items-selector-add-normal-cards" class="userscript-trade-action third">Add All Normal Cards</button>'
          + '<button id="items-selector-add-backgrounds" class="userscript-trade-action third">Add All Backgrounds</button>'
          + '<button id="items-selector-add-emoticons" class="userscript-trade-action third">Add All Emoticons</button>';
        balancerGroupElem.querySelector('.group-entries').insertAdjacentHTML('beforebegin', addButtonsHTMLString);

        document.getElementById('items-selector-add-normal-cards').addEventListener('click', TradeofferWindow.itemsSelectorGroupBalancerAddAllNormalCardsListener);
        document.getElementById('items-selector-add-backgrounds').addEventListener('click', TradeofferWindow.itemsSelectorGroupBalancerAddAllBackgroundsListener);
        document.getElementById('items-selector-add-emoticons').addEventListener('click', TradeofferWindow.itemsSelectorGroupBalancerAddAllEmoticonsListener);

        TradeofferWindow.itemsSelectorRecalculateBalancerAvailability();
        TradeofferWindow.itemsSelectorRecalculateAvailability('cardSets');

        itemsSelectorShortcuts.group.balancer.classList.remove('loading');
    },
    itemsSelectorGroupBalancerGenerateItemDataCategories: async function(profileid) {
        let { APP_NAME_MAP } = TradeofferWindow.itemsSelectorData.balancer;
        let steamInventory = await TradeofferWindow.getTradeInventory(profileid, '753', '6', TradeofferWindow.filterInventoryBlockSetup());

        let data = TradeofferWindow.itemsSelectorData.balancer.data[profileid] = { card: [], background: [], emoticon: [] };
        for(let assetid in steamInventory.rgInventory) {
            let asset = steamInventory.rgInventory[assetid];
            let descript = steamInventory.rgDescriptions[`${asset.classid}_${asset.instanceid}`];

            let itemType = descript.tags.find(x => x.category === 'item_class');
            if(!itemType) {
                console.warn('TradeofferWindow.itemsSelectorGroupBalancerGenerateItemDataCategories(): Description has no item type??');
                console.log(descript);
                continue;
            }

            let rarity = itemType.internal_name === 'item_class_2'
              ? descript.tags.find(x => x.category === 'cardborder')
              : descript.tags.find(x => x.category === 'droprate');
            if(!rarity) {
                console.warn('TradeofferWindow.itemsSelectorGroupBalancerGenerateItemDataCategories(): Description has no rarity??');
                console.log(descript);
                continue;
            }

            itemType = Profile.ITEM_TYPE_MAP[itemType.internal_name];
            rarity = Profile.ITEM_TYPE_MAP[rarity.internal_name] ?? parseInt(rarity.internal_name.replace(/\D+/g, ''));

            data[itemType] ??= [{}];
            while(data[itemType].length <= rarity) {
                data[itemType].push({});
            }

            let itemList = data[itemType][rarity];

            let appNameTag = descript.tags.find(x => x.category === 'Game');
            if(!appNameTag) {
                console.warn('TradeofferWindow.itemsSelectorGroupBalancerGenerateItemDataCategories(): Description has no app name??');
                console.log(descript);
                appNameTag = { internal_name: '' };
            }

            APP_NAME_MAP[descript.market_fee_app] ??= appNameTag.name;

            // NOTE: Too much of a performance hit, figure out a different way to save data
            // await Profile.updateAppMetaData(descript.market_fee_app, { appid: parseInt(descript.market_fee_app), name: appNameTag.name }, false);

            asset.amount = parseInt(asset.amount);

            itemList[descript.market_fee_app] ??= [];
            let classItemGroup = itemList[descript.market_fee_app].find(x => x.classid === asset.classid);
            if(!classItemGroup) {
                classItemGroup = {
                    classid: asset.classid,
                    tradables: [],
                    count: 0
                };
                itemList[descript.market_fee_app].push(classItemGroup);
            }

            if(descript.tradable) {
                classItemGroup.tradables.push({ assetid: asset.id, instanceid: asset.instanceid, count: asset.amount });
            }
            classItemGroup.count += asset.amount;
        }

        return data;
    },
    itemsSelectorGroupBalancerMatchSteamItems: async function() {
        const fillMissingItems = (target, source) => {
            for(let i=0; i<source.length; i++) {
                if(!target.some(x => x.classid === source[i].classid)) {
                    target.push({ classid: source[i].classid, tradables: [], count: 0 });
                }
            }
        }

        let { data, itemsSelectorData: { balancer: balancerData } } = TradeofferWindow;

        let itemSetsData1 = await TradeofferWindow.itemsSelectorGroupBalancerGenerateItemDataCategories(data.me.id);
        if(!itemSetsData1) {
            throw 'TradeofferWindow.itemsSelectorGroupBalancerMatchSteamItems(): User\'s steam item data not available??';
        }

        let itemSetsData2 = await TradeofferWindow.itemsSelectorGroupBalancerGenerateItemDataCategories(data.them.id);
        if(!itemSetsData2) {
            throw 'TradeofferWindow.itemsSelectorGroupBalancerMatchSteamItems(): Partner\'s steam item data not available??';
        }

        let matchResults = balancerData.results = {};
        for(let [set1, appid, rarity, itemType] of TradeofferWindow.itemsSelectorItemSetsIter(itemSetsData1)) {
            if(!Matcher.MATCH_TYPE_LIST.includes(itemType)) {
                continue;
            }

            let set2 = itemSetsData2[itemType]?.[rarity]?.[appid];
            if(!set2) {
                continue;
            }

            fillMissingItems(set1, set2);
            fillMissingItems(set2, set1);

            if(set1.length !== set2.length) {
                console.error(`TradeofferWindow.itemsSelectorGroupBalancerMatchSteamItems(): Sets have unequal number of item entries! ItemType: ${itemType}, Appid: ${appid}`);
                continue;
            } else if(set1.length === 1) {
                continue;
            }

            let swap = Array(set1.length).fill(0);
            let history = [];

            set1.sort((a, b) => a.classid.localeCompare(b.classid));
            set2.sort((a, b) => a.classid.localeCompare(b.classid));

            for(let i=0; i<Matcher.MAX_MATCH_ITER; i++) {
                let flip = i % 2;
                let swapset1 = set1.map((x, i) => x.count + swap[i]);
                let swapset2 = set2.map((x, i) => x.count - swap[i]);
                let mode = -1; // mutual only mode

                let balanceResult = Matcher.balanceVariance((flip ? swapset2 : swapset1), (flip ? swapset1 : swapset2), false, mode);
                if(balanceResult.history.length === 0) {
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
                matchResults[itemType] ??= [{}];
                while(matchResults[itemType].length <= rarity) {
                    matchResults[itemType].push({});
                }
                matchResults[itemType][rarity][appid] = { swap, history };
            }
        }

        return matchResults;
    },
    itemsSelectorGenerateBalancerEntry: function(entryData) {
        if(entryData.id === undefined) {
            console.warn('TradeofferWindow.itemsSelectorGenerateBalancerEntry(): id not found! Entry will not have an id...');
        }

        if(entryData.items1.length<1 || entryData.items1.length>14) {
            console.warn('TradeofferWindow.itemsSelectorGenerateBalancerEntry(): Number of items not between 1-14??');
        } else if(entryData.items2.length<1 || entryData.items2.length>14) {
            console.warn('TradeofferWindow.itemsSelectorGenerateBalancerEntry(): Number of items not between 1-14??');
        }

        let dataIdAttrString = entryData.id !== undefined ? ` data-id="${entryData.id}"` : '';
        dataIdAttrString += entryData.itemType !== undefined ? ` data-item-type="${entryData.itemType}"` : '';
        dataIdAttrString += entryData.rarity !== undefined ? ` data-rarity="${entryData.rarity}"` : '';
        let items1HTMLString = '';
        for(let item of entryData.items1) {
            items1HTMLString += TradeofferWindow.itemsSelectorGenerateItem(item);
        }

        let items2HTMLString = '';
        for(let item of entryData.items2) {
            items2HTMLString += TradeofferWindow.itemsSelectorGenerateItem(item);
        }

        // calculate container sizes
        let items1SpanLength = entryData.items1.length>2 ? Math.ceil(entryData.items1.length / 2) : entryData.items1.length;
        let items2SpanLength = entryData.items2.length>2 ? Math.ceil(entryData.items2.length / 2) : entryData.items2.length;
        while(items1SpanLength + items2SpanLength > 10) {
            items1SpanLength--;
            if(items1SpanLength + items2SpanLength > 10) {
                items2SpanLength--;
            }
        }
        let totalSpanLength = items1SpanLength + items2SpanLength + 1;

        let items1ContainerSizeString = ` split${items1SpanLength}`;
        let items2ContainerSizeString = ` split${items2SpanLength}`;
        let entrySizeString = ` span${totalSpanLength}`;

        return `<div class="items-selector-entry available${entrySizeString}"${dataIdAttrString}>`
          +     '<div class="items-selector-entry-header">'
          +         `<div class="entry-title" title="${entryData.name}">`
          +             entryData.name
          +         '</div>'
          +     '</div>'
          +     '<div class="items-selector-balancer-container">'
          +         `<div class="items-selector-inventory-items${items1ContainerSizeString}">`
          +             items1HTMLString
          +         '</div>'
          +         '<div class="balancer-arrows userscript-bg-filtered alt-arrows"></div>'
          +         `<div class="items-selector-inventory-items${items2ContainerSizeString}">`
          +             items2HTMLString
          +         '</div>'
          +     '</div>'
          + '</div>';

    },
    itemsSelectorItemSetsIter: function(itemSetsData) {
        function* itemSetsIter(dataset) {
            for(let type in dataset) {
                for(let rarity=0; rarity<dataset[type].length; rarity++) {
                    for(let appid in dataset[type][rarity]) {
                        yield [ dataset[type][rarity][appid], appid, rarity, type ];
                    }
                }
            }
        }

        return itemSetsIter(itemSetsData);
    },

    itemsSelectorGroupBalancerAddAllNormalCardsListener: function(event) {
        TradeofferWindow.itemsSelectorGroupBalancerAddAllItemsOfType('card', 0);
    },
    itemsSelectorGroupBalancerAddAllBackgroundssListener: function(event) {
        TradeofferWindow.itemsSelectorGroupBalancerAddAllItemsOfType('background');
    },
    itemsSelectorGroupBalancerAddAllEmoticonsListener: function(event) {
        TradeofferWindow.itemsSelectorGroupBalancerAddAllItemsOfType('emoticon');
    },
    itemsSelectorGroupBalancerAddAllItemsOfType: async function(itemType, rarityLevel) {
        const addItemList = async (items, profileid, addReverse) => {
            for(let itemData of items) {
                await TradeofferWindow.offerItemlistAddClassItems(profileid, itemData.appid, itemData.contextid, itemData.classid, itemData.instanceid, itemData.amount, addReverse);
            }
        }

        let { data, itemsSelectorShortcuts, itemsSelectorData } = TradeofferWindow;
        let groupBalancerData = itemsSelectorData.groups.balancer;
        let groupBalancerElem = itemsSelectorShortcuts.group.balancer;

        if(!itemType) {
            throw 'TradeofferWindow.itemsSelectorGroupBalancerAddAllItemsOfType(): item type not specified! Aborting...';
        }

        if(rarityLevel !== undefined) {
            rarityLevel = String(rarityLevel);
        }
        for(let entryElem of groupBalancerElem.querySelectorAll('.items-selector-entry')) {
            if(entryElem.dataset.itemType !== itemType) {
                continue;
            } else if(rarityLevel !== undefined && entryElem.dataset.rarity !== rarityLevel) {
                continue;
            }

            let entryData = groupBalancerData.entries[entryElem.dataset.id];
            await addItemList(entryData.items1, data.me.id, true);
            await addItemList(entryData.items2, data.them.id, true);
        }
        TradeofferWindow.offerUpdateTradeState();

        TradeofferWindow.overlayBodyToggle('offerWindow');
    },

    itemsSelectorGroupEntryDialogShowListener: function(event) {
        console.log('TradeofferWindow.itemsSelectorGroupEntryDialogShow() WIP');

        let { itemsSelectorShortcuts, itemsSelectorData } = TradeofferWindow;

        let groupElem = event.currentTarget;
        if(!groupElem.matches('.items-selector-group')) {
            throw 'TradeofferWindow.itemsSelectorGroupEntryDialogShow(): Not attached to a items selector group element???';
        }

        if(groupElem.dataset.id !== 'balancer' && !itemsSelectorData.currentProfileid) {
            return;
        }

        let entryElem = event.target.closest('.items-selector-entry');
        if(!entryElem) {
            return;
        }

        TradeofferWindow.itemsSelectorGroupEntryDialogUpdate(groupElem.dataset.id, entryElem.dataset.id);
        itemsSelectorShortcuts.dialogContainer.classList.add('active');
    },
    itemsSelectorGroupEntryDialogDeleteEntryListener: async function(event) {
        let { itemsSelectorShortcuts, itemsSelectorData } = TradeofferWindow;
        let { currentGroupId, currentEntryId } = itemsSelectorData;

        if(currentGroupId === null || currentEntryId === null) {
            console.warn('TradeofferWindow.itemsSelectorGroupEntryDialogDeleteEntryListener(): No current group or entry id set! Nothing will be deleted...');
            return;
        } else if(currentGroupId !== 'custom') {
            console.warn('TradeofferWindow.itemsSelectorGroupEntryDialogDeleteEntryListener(): Only entries from the custom group should be deleted! Nothing will be deleted...');
            return;
        }

        let groupData = itemsSelectorData.groups[currentGroupId];
        let entryData = groupData.entries[currentEntryId];

        let configGroupEntries = globalSettings.tradeoffer.itemsSelectorCustomGroupEntries;
        let configEntry = configGroupEntries[entryData.pos];
        if(!configEntry) {
            console.warn('TradeofferWindow.itemsSelectorGroupEntryDialogDeleteEntryListener(): Entry not found in configs! Nothing will be deleted...');
            return;
        }

        let entryElem = itemsSelectorShortcuts.group[currentGroupId].querySelector(`[data-id="${currentEntryId}"]`);
        if(!entryElem) {
            console.warn('TradeofferWindow.itemsSelectorGroupEntryDialogDeleteEntryListener(): Entry element not found???? Nothing will be deleted...');
            return;
        }

        delete configGroupEntries[currentEntryId];
        delete groupData.entries[currentEntryId];
        entryElem.remove();

        await TradeofferWindow.configSave();
    },
    itemsSelectorGroupEntryDialogCancelListener: function(event) {
        let { currentGroupId, currentEntryId } = TradeofferWindow.itemsSelectorShortcuts;
        currentGroupId = null;
        currentEntryId = null;
        TradeofferWindow.itemsSelectorShortcuts.dialogContainer.classList.remove('active');
    },
    itemsSelectorGroupEntryDialogResetListener: function(event) {
        let { itemsSelectorShortcuts } = TradeofferWindow;

        if(itemsSelectorShortcuts.body === undefined) {
            return;
        }

        itemsSelectorShortcuts.dialogTextInput.value = itemsSelectorShortcuts.dialogTextInput.getAttribute('value') ?? 0;
        itemsSelectorShortcuts.dialogSliderInput.value = itemsSelectorShortcuts.dialogSliderInput.getAttribute('value') ?? 0;
    },
    itemsSelectorGroupEntryDialogConfirmListener: async function(event) {
        const addItemList = async (items, profileid, addReverse) => {
            for(let itemData of items) {
                let amountToAdd = value*itemData.amount;
                await TradeofferWindow.offerItemlistAddClassItems(profileid, itemData.appid, itemData.contextid, itemData.classid, itemData.instanceid, amountToAdd, addReverse);
            }
        }

        let { data, itemsSelectorShortcuts, itemsSelectorData } = TradeofferWindow;
        let { currentProfileid, currentGroupId, currentEntryId } = itemsSelectorData;

        if(currentGroupId === null || currentEntryId === null) {
            console.error('TradeofferWindow.itemsSelectorGroupEntryDialogConfirmListener(): No current group or entry id set! No items will be added...');
            return;
        } else if(!itemsSelectorShortcuts.dialogTextInput) {
            console.error('TradeofferWindow.itemsSelectorGroupEntryDialogConfirmListener(): Text input element not found!?!? No items will be added...');
            return;
        }

        let value = parseInt(itemsSelectorShortcuts.dialogTextInput.value);
        let entryData = itemsSelectorData.groups[currentGroupId].entries[currentEntryId];
        if(currentGroupId === 'balancer') {
            await addItemList(entryData.items1, data.me.id, true);
            await addItemList(entryData.items2, data.them.id, true);
        } else {
            await addItemList(entryData.items, currentProfileid, false);
        }
        TradeofferWindow.offerUpdateTradeState();

        TradeofferWindow.itemsSelectorShortcuts.dialogContainer.classList.remove('active');
        TradeofferWindow.overlayBodyToggle('offerWindow');
    },
    itemsSelectorGroupEntryDialogCheckAvailabilityListener: async function() {
        let { itemsSelectorShortcuts, itemsSelectorData } = TradeofferWindow;

        console.log('Dialog Check Availability WIP!');

        let entryData = itemsSelectorData.groups[itemsSelectorData.currentGroupId]?.entries[itemsSelectorData.currentEntryId];
        if(!entryData) {
            throw 'TradeofferWindow.itemsSelectorGroupEntryDialogCheckAvailabilityListener(): No entry data found?!?!';
        }

        itemsSelectorShortcuts.dialogButtonCheck.setAttribute('disabled', '');

        let loadedInvTracker = new Set();
        for(let itemData of entryData.items) {
            let appContext = `${itemData.appid}_${itemData.contextid}`;
            if(!loadedInvTracker.has(appContext)) {
                await TradeofferWindow.getTradeInventory(itemsSelectorData.currentProfileid, itemData.appid, itemData.contextid, TradeofferWindow.filterInventoryBlockSetup());
                loadedInvTracker.add(appContext);
            }
        }

        TradeofferWindow.itemsSelectorRecalculateAvailability('cardSets');
        TradeofferWindow.itemsSelectorGroupEntryDialogUpdate(itemsSelectorData.currentGroupId, itemsSelectorData.currentEntryId);
    },
    itemsSelectorGroupEntryDialogUpdate: function(groupId, entryId) {
        let { itemsSelectorShortcuts, itemsSelectorData } = TradeofferWindow;

        let groupData = itemsSelectorData.groups[groupId];
        if(!groupData) {
            throw 'TradeofferWindow.itemsSelectorGroupEntryDialogShow(): group data not found???';
        }

        let entryData = groupData.entries[entryId];
        if(!entryData) {
            throw 'TradeofferWindow.itemsSelectorGroupEntryDialogShow(): entry data not found???';
        }

        // hide entry deletion button if its not a custom entry
        if(groupData.id === 'custom') {
            itemsSelectorShortcuts.dialog.querySelector('.items-selector-entry-remove').classList.remove('hidden');
        } else {
            itemsSelectorShortcuts.dialog.querySelector('.items-selector-entry-remove').classList.add('hidden');
        }

        // populate dialog: profile
        let dialogProfileElem = itemsSelectorShortcuts.dialogProfile;
        if(dialogProfileElem.dataset.id !== itemsSelectorData.currentProfileid) {
            dialogProfileElem.querySelector('.dialog-profile-avatar').src = '';
            dialogProfileElem.querySelector('.dialog-profile-name').textContent = '';
            dialogProfileElem.dataset.id = itemsSelectorData.currentProfileid;
        }

        itemsSelectorShortcuts.dialogTitle.querySelector('.dialog-group-name').textContent = groupData.name;
        itemsSelectorShortcuts.dialogTitle.querySelector('.dialog-entry-name').textContent = entryData.name;

        let inputVal = 0;
        if(groupData.id === 'balancer') {
            itemsSelectorShortcuts.dialogItems.innerHTML = '<div class="items-selector-balancer-container">'
              +     `<div class="items-selector-inventory-items">`
              +         entryData.items1.map(item => TradeofferWindow.itemsSelectorGenerateItem(item)).join('')
              +     '</div>'
              +     '<div class="balancer-arrows userscript-bg-filtered alt-arrows"></div>'
              +     `<div class="items-selector-inventory-items">`
              +         entryData.items2.map(item => TradeofferWindow.itemsSelectorGenerateItem(item)).join('')
              +     '</div>'
              + '</div>';


            itemsSelectorShortcuts.dialogSliderInput.setAttribute('disabled', '');
            itemsSelectorShortcuts.dialogTextInput.setAttribute('disabled', '');
            itemsSelectorShortcuts.dialogButtonReset.setAttribute('disabled', '');
            itemsSelectorShortcuts.dialogButtonCheck.setAttribute('disabled', '');

            if(entryData.isAvailable) {
                inputVal = 1;
                itemsSelectorShortcuts.dialogButtonConfirm.removeAttribute('disabled');
            } else {
                inputVal = 0;
                itemsSelectorShortcuts.dialogButtonConfirm.setAttribute('disabled', '');
            }

            itemsSelectorShortcuts.dialogSliderInput.setAttribute('max', String(inputVal));
            itemsSelectorShortcuts.dialogTextInput.setAttribute('max', String(inputVal));
        } else {
            itemsSelectorShortcuts.dialogItems.innerHTML = `<div class="items-selector-inventory-items">`
              +     entryData.items.map(item => TradeofferWindow.itemsSelectorGenerateItem(item)).join('')
              + '</div>';

            let maxAvailable = entryData.maxAvailable?.[itemsSelectorData.currentProfileid];
            if(Number.isInteger(maxAvailable)) {
                itemsSelectorShortcuts.dialogButtonCheck.setAttribute('disabled', '');
            } else {
                itemsSelectorShortcuts.dialogButtonCheck.removeAttribute('disabled');
            }
            if(maxAvailable === undefined || maxAvailable === null || maxAvailable === 0) {
                inputVal = 0;
                itemsSelectorShortcuts.dialogSliderInput.setAttribute('disabled', '');
                itemsSelectorShortcuts.dialogTextInput.setAttribute('disabled', '');
                itemsSelectorShortcuts.dialogButtonReset.setAttribute('disabled', '');
                itemsSelectorShortcuts.dialogButtonConfirm.setAttribute('disabled', '');
            } else if(maxAvailable > 0) {
                inputVal = 1;
                itemsSelectorShortcuts.dialogSliderInput.removeAttribute('disabled');
                itemsSelectorShortcuts.dialogTextInput.removeAttribute('disabled');
                itemsSelectorShortcuts.dialogButtonReset.removeAttribute('disabled');
                itemsSelectorShortcuts.dialogButtonConfirm.removeAttribute('disabled');
            } else {
                throw 'TradeofferWindow.itemsSelectorGroupEntryDialogShow(): maxAvailable is not a valid value!';
            }

            itemsSelectorShortcuts.dialogSliderInput.setAttribute('max', String(maxAvailable));
            itemsSelectorShortcuts.dialogTextInput.setAttribute('max', String(maxAvailable));
        }

        itemsSelectorShortcuts.dialogSliderInput.setAttribute('value', String(inputVal));
        itemsSelectorShortcuts.dialogTextInput.setAttribute('value', String(inputVal));
        itemsSelectorShortcuts.dialogSliderInput.value = inputVal;
        itemsSelectorShortcuts.dialogTextInput.value = inputVal;

        itemsSelectorData.currentGroupId = groupData.id;
        itemsSelectorData.currentEntryId = entryData.id;
    },
    itemsSelectorGroupEntryDialogUpdateSliderListener: function(event) {
        TradeofferWindow.itemsSelectorShortcuts.dialogSliderInput.value = event.target.value;
    },
    itemsSelectorGroupEntryDialogUpdateTextListener: function(event) {
        TradeofferWindow.itemsSelectorShortcuts.dialogTextInput.value = event.target.value;
    },

    itemsSelectorGenerateGroup: function(groupData) {
        if(groupData.id === undefined) {
            console.warn('TradeofferWindow.itemsSelectorGenerateGroup(): id not found! Group will not have an id...');
        }

        let dataIdAttrString = groupData.id !== undefined ? ` data-id="${groupData.id}"` : '';
        let groupEntriesHTMLString = '';
        for(let groupEntry of groupData.entries) {
            groupEntriesHTMLString += TradeofferWindow.itemsSelectorGenerateGroupEntry(groupEntry);
        }

        return `<div class="items-selector-group"${dataIdAttrString}>`
          +     '<div class="items-selector-group-header">'
          +         '<div class="group-title">'
          +             groupData.name
          +         '</div>'
          +     '</div>'
          +     '<div class="group-entries">'
          +         groupEntriesHTMLString
          +     '</div>'
          +     cssAddThrobber()
          + '</div>';
    },
    itemsSelectorGenerateGroupEntry: function(entryData) {
        if(entryData.id === undefined) {
            console.warn('TradeofferWindow.itemsSelectorGenerateGroupEntry(): id not found! Entry will not have an id...');
        }

        let availability = TradeofferWindow.itemsSelectorGroupEntryCheckAvailability(entryData);
        if(availability !== '') {
            availability = ' ' + availability;
        }
        let dataIdAttrString = entryData.id !== undefined ? ` data-id="${entryData.id}"` : '';
        let itemsHTMLString = '';
        for(let item of entryData.items) {
            itemsHTMLString += TradeofferWindow.itemsSelectorGenerateItem(item);
        }
        let containerSizeString = (entryData.items.length > 22) ? ''
            : (entryData.items.length < 3) ? ' span2'
            : ` span${Math.ceil(entryData.items.length/2)}`;

        return `<div class="items-selector-entry${availability}${containerSizeString}"${dataIdAttrString}>`
          +     '<div class="items-selector-entry-header">'
          +         `<div class="entry-title" title="${entryData.name}">`
          +             entryData.name
          +         '</div>'
          +     '</div>'
          +     `<div class="items-selector-inventory-items">`
          +         itemsHTMLString
          +     '</div>'
          + '</div>';
    },
    itemsSelectorGenerateItem: function(itemData) {
        // get description data from somewhere to access image and name
        // jank, but works for now ... need to pool together descriptions to make things easier
        let { inventories, descriptionClassAssets } = TradeofferWindow.data;

        let descript;
        for(let profileid in inventories) {
            if(descript) {
                break;
            }

            let inventoryContext = inventories[profileid]?.[itemData.appid]?.[itemData.contextid];
            if(!inventoryContext) {
                continue;
            }

            let descriptClass = descriptionClassAssets[profileid]?.[itemData.appid]?.[itemData.contextid]?.[itemData.classid];
            if(!descriptClass || descriptClass.count === 0) {
                continue;
            }

            if(itemData.instanceid) {
                descript = inventoryContext.rgDescriptions[`${itemData.classid}_${itemData.instanceid}`];
            } else if(itemData.classid && descriptClass.assets.length > 0) {
                let arbitraryAsset = descriptClass.assets[0];
                descript = inventoryContext.rgDescriptions[`${itemData.classid}_${arbitraryAsset.instanceid}`];
            }
        }

        if(!descript) {
            console.error('TradeofferWindow.itemsSelectorGenerateItem(): No description found!!!');
        }

        let imgUrl = descript?.icon_url ? `https://community.akamai.steamstatic.com/economy/image/${descript.icon_url}/96fx96f` : '';
        let name = descript?.name ?? '???';

        let styleAttrString = '';
        styleAttrString += descript?.name_color ? `border-color: #${descript.name_color};` : '';
        styleAttrString += descript?.background_color ? `background-color: #${descript.background_color};` : '';
        if(styleAttrString.length) {
            styleAttrString = ` style="${styleAttrString}"`;
        }

        let dataAttrString = '';
        dataAttrString += itemData.appid ? ` data-appid="${itemData.appid}"` : '';
        dataAttrString += itemData.contextid ? ` data-contextid="${itemData.contextid}"` : '';
        dataAttrString += itemData.classid ? ` data-classid="${itemData.classid}"` : '';
        dataAttrString += itemData.instanceid ? ` data-instanceid="${itemData.instanceid}"` : '';
        dataAttrString += itemData.amount ? ` data-amount="${parseInt(itemData.amount).toLocaleString()}"` : '';

        return `<div class="inventory-item-container" title="${name}"${dataAttrString}${styleAttrString}>`
          +     `<img loading="lazy" src="${imgUrl}" alt="${name}">`
          + '</div>';
    },





    messageShortcuts: {},

    messageSetup: function() {
        console.log('Message WIP');

        if (TradeofferWindow.messageShortcuts.body !== undefined) {
            return;
        }

        // generate prefilter body and attach to overlay body
    },





    summaryShortcuts: {},
    summaryData: {
        offerSetData: {
            // sets
        },
    },

    summarySetup: function() {
        console.log('Summary WIP');

        let { shortcuts, data, summaryShortcuts } = TradeofferWindow;

        if (TradeofferWindow.summaryShortcuts.body !== undefined) {
            TradeofferWindow.summaryReset();
            return;
        }

        const itemlistMeHTMLString = `<div id="offer-summary-itemlist-me" class="offer-itemlist offer-summary-itemlist" data-id="${data.me.id}">`
          +     '<div class="itemlist-header">'
          +         '<div class="userscript-icon-name-container">'
          +             `<img src="${data.me.img}">`
          +             data.me.name
          +         '</div>'
          +     '</div>'
          +     '<div class="itemlist-list">'
          +     '</div>'
          + '</div>';
        const itemlistThemHTMLString = `<div id="offer-summary-itemlist-them" class="offer-itemlist offer-summary-itemlist"data-id=" ${data.me.id}">`
          +     '<div class="itemlist-header">'
          +         '<div class="userscript-icon-name-container">'
          +             `<img src="${data.them.img}">`
          +             data.them.name
          +         '</div>'
          +     '</div>'
          +     '<div class="itemlist-list">'
          +     '</div>'
          + '</div>';
        const detailsHTMLString = '<div class="offer-summary-details-container">'
          +     '<div class="offer-summary-details">'
          +         '<div class="summary-details-header">'
          +             '<span class="summary-details-title">Offer Items Analysis</span>'
          +         '</div>'
          +     '</div>'
          + '</div>';
        const summaryBodyHTMLString = '<div class="offer-summary-body">'
          +     '<div class="offer-summary-main-control">'
          +         '<div class="main-control-section">'
          +             '<button id="offer-summary-decline" class="userscript-btn red">Decline</button>'
          +         '</div>'
          +         '<div class="main-control-section">'
          +             '<div id="offer-summary-escrow-status" class="main-control-status">??</div>' // show trade status here, (escrow: yellow number, empty offer: red, valid offer/counter: green)
          +             '<div id="offer-summary-empty-status" class="main-control-status">Offer is empty...</div>' // show trade status here, (valid offer/counter: green)
          +         '</div>'
          +         '<div class="main-control-section">'
          +             '<button id="offer-summary-confirm" class="userscript-trade-action">???</button>' // accept or send
          +         '</div>'
          +     '</div>'
          +     '<div class="offer-summary-message">'
          +         '' // offer message
          +     '</div>'
          +     itemlistThemHTMLString
          +     itemlistMeHTMLString
          +     detailsHTMLString
          + '</div>';

        shortcuts.overlayBody.insertAdjacentHTML('beforeend', summaryBodyHTMLString);

        summaryShortcuts.body = shortcuts.overlayBody.querySelector('& > .offer-summary-body');
        summaryShortcuts.mainControl = summaryShortcuts.body.querySelector('.offer-summary-main-control');
        summaryShortcuts.statusEscrow = document.getElementById('offer-summary-escrow-status');
        summaryShortcuts.statusEmpty = document.getElementById('offer-summary-empty-status');
        summaryShortcuts.message = summaryShortcuts.body.querySelector('.offer-summary-message');
        summaryShortcuts.itemListMe = document.getElementById('offer-summary-itemlist-me');
        summaryShortcuts.itemListThem = document.getElementById('offer-summary-itemlist-them');
        summaryShortcuts.itemList = {
            [data.me.id]: summaryShortcuts.itemListMe,
            [data.them.id]: summaryShortcuts.itemListThem,
        };
        summaryShortcuts.details = summaryShortcuts.body.querySelector('.offer-summary-details');
        summaryShortcuts.declineButton = document.getElementById('offer-summary-decline');
        summaryShortcuts.confirmButton = document.getElementById('offer-summary-confirm');

        if(data.offerId !== '0') {
            summaryShortcuts.declineButton.addEventListener('click', TradeofferWindow.summaryDeclineOfferListener);
        } else {
            summaryShortcuts.declineButton.classList.add('hidden');
            summaryShortcuts.confirmButton.textContent = 'Send';
        }
        summaryShortcuts.confirmButton.addEventListener('click', TradeofferWindow.summaryConfirmOfferListener);

        TradeofferWindow.summaryReset();
    },
    summaryReset: function() {
        let { data, offerShortcuts, offerData: { offer }, summaryShortcuts, summaryData } = TradeofferWindow;

        summaryShortcuts.message.textContent = offerShortcuts.message.value;

        let newOfferSetData = new Set();
        const addOfferItemsToSetData = (isMe) => {
            let profileid = data[isMe ? 'me' : 'them'].id;
            newOfferSetData[profileid] = new Set();
            for(let [classData, classid, contextid, appid] of TradeofferWindow.offerProfileDataIter(offer[profileid])) {
                for(let assetData of classData.assets) {
                    newOfferSetData[profileid].add(`${appid}_${contextid}_${assetData.assetid}_${assetData.amount}`);
                }
            }
        };
        addOfferItemsToSetData(true);
        addOfferItemsToSetData(false);

        if(summaryData.offerSetData[data.me.id]?.symmetricDifference(newOfferSetData[data.me.id]).size === 0
          && summaryData.offerSetData[data.them.id]?.symmetricDifference(newOfferSetData[data.them.id]).size === 0) {
            return;
        }

        summaryData.offerSetData = newOfferSetData;
        let offerSetDataMe = summaryData.offerSetData[data.me.id];
        let offerSetDataThem = summaryData.offerSetData[data.them.id];

        if(data.offerId !== '0') {
            if(data.tradeState === 1) {
                summaryShortcuts.declineButton.classList.remove('hidden');
                summaryShortcuts.confirmButton.textContent = 'Accept';
            } else if(data.tradeState === 2) {
                summaryShortcuts.declineButton.classList.add('hidden');
                summaryShortcuts.confirmButton.textContent = 'Send';
            }
        }

        let isEmptyOfferSets = !offerSetDataMe.size && !offerSetDataThem.size;
        summaryShortcuts.confirmButton.classList[isEmptyOfferSets ? 'add' : 'remove']('hidden');

        let escrowDays = Math.max(offerSetDataMe.size && data.me.escrowDays, offerSetDataThem.size && data.them.escrowDays);
        summaryShortcuts.mainControl.classList[escrowDays || isEmptyOfferSets ? 'add' : 'remove']('warn');

        summaryShortcuts.statusEmpty.classList[isEmptyOfferSets ? 'remove' : 'add']('hidden');
        summaryShortcuts.statusEscrow.classList[!isEmptyOfferSets && escrowDays ? 'remove' : 'add']('hidden');
        summaryShortcuts.statusEscrow.textContent = escrowDays;

        TradeofferWindow.summaryItemlistRepopulate();

        for(let detailsSectionElem of summaryShortcuts.details.querySelectorAll('& > .summary-details-section')) {
            detailsSectionElem.remove();
        }

        // place buttons or triggers back on the page (but dont place them if no items of that inventory needed for analysis is present)

        TradeofferWindow.summaryDetailsDisplayTotals();
        TradeofferWindow.summaryDetailsDisplayUncommons();
        TradeofferWindow.summaryDetailsDisplayCardStats();
    },
    summaryConfirmOfferListener: function() {
        // send new offer (send counter offer is the same)
        // execute accept request
        let { data } = TradeofferWindow;

        // toggle waiting animation of some sort on

        if(data.tradeState === 0 || data.tradeState === 2) {
            let payload = TradeofferWindow.summaryGenerateOfferPayload();

            fetch('https://steamcommunity.com/tradeoffer/new/send', {
                method: 'post',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: new URLSearchParams(payload)
                // header details
            }).then((response) => {
                // toggle waiting animation off if success, remind user to confirm offer in authenticator
            }).catch((error) => {
                // change waiting animation into something else if failed
            });
        } else if(data.tradeState === 1) {
            TradeofferWindow.summaryAcceptOffer();
        }
    },
    summaryAcceptOffer: function() {
        let { data } = TradeofferWindow;
        if(data.tradeState !== 1) {
            throw 'TradeofferWindow.summaryAceeptOffer(): Incorrect trade state detected, this function shouldn\'t have been executed!';
        }

        let payload = {
            sessionid: steamToolsUtils.getSessionId(),
            serverid: '1',
            tradeofferid: data.offerId,
            partner: data.them.id,
            captcha: '', // not sure about this yet
        };

        fetch(`https://steamcommunity.com/tradeoffer/${data.offerId}/accept`, {
            method: 'post',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams(payload)
        }).then((response) => {
            // should close the offer window
        }).catch((error) => {

        });
    },
    summaryDeclineOfferListener: function() {
        let { data } = TradeofferWindow;
        if(data.tradeState !== 1) {
            throw 'TradeofferWindow.summaryDeclineOfferListener(): Incorrect trade state detected, this function shouldn\'t have been executed!';
        }

        // toggle waiting animation of some sort on

        let payload = {
            sessionid: steamToolsUtils.getSessionId()
        }

        fetch(`https://steamcommunity.com/tradeoffer/${data.offerId}/decline`, {
            method: 'post',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams(payload)
        }).then((response) => {
            // should close the offer window
        }).catch((error) => {

        });
    },
    summaryGenerateOfferPayload: function() {
        let { data, offerShortcuts, offerData: { offer } } = TradeofferWindow;

        const generateOfferAssets = (offerDataProfile) => {
            let assetList = [];
            for(let [classData, classid, contextid, appid] of TradeofferWindow.offerProfileDataIter(offerDataProfile)) {
                for(let assetData of classData.assets) {
                    assetList.push({
                        appid: appid,
                        contextid: contextid,
                        amount: assetData.amount,
                        assetid: assetData.assetid
                    });
                }
            }

            // maybe currency here?

            return {
                assets: assetList,
                currency: [],
                ready: false
            };
        };

        let message = offerShortcuts.message.value;
        let offerCreateParams = unsafeWindow?.CTradeOfferStateManager.m_rgTradeOfferCreateParams;
        if(!offerCreateParams) {
            throw 'TradeofferWindow.offerGenerateOfferPayload(): CTradeOfferStateManager.m_rgTradeOfferCreateParams not found!';
        }

        let offerStatus = {
            newversion: true,
            version: 1,
            me: generateOfferAssets(offer[data.me.id]),
            them: generateOfferAssets(offer[data.them.id])
        }

        let offerPayload = {
            sessionid: steamToolsUtils.getSessionId(),
            serverid: '1',
            partner: data.them.id,
            tradeoffermessage: message,
            json_tradeoffer: JSON.stringify(offerStatus),
            captcha: '',
            trade_offer_create_params: JSON.stringify(offerCreateParams)
        };

        if(data.tradeState === 2) {
            offerPayload.tradeofferid_countered = data.offerId;
        }

        return offerPayload;
    },

    summaryItemlistRepopulate() {
        const generateItemlistHTMLString = (profileid) => {
            let offerProfileData = offer[profileid];
            let inventoryData = data.inventories[profileid];

            let itemlistHTMLString = '';
            for(let [classData, classid, contextid, appid] of TradeofferWindow.offerProfileDataIter(offer[profileid])) {
                let inventoryContextData = inventoryData[appid][contextid];
                for(let assetData of classData.assets) {
                    let descript = inventoryContextData.rgDescriptions[`${classid}_${assetData.instanceid}`];
                    if(!descript) {
                        throw 'TradeofferWindow.summaryItemlistRepopulate(): description not found for an asset!';
                    }

                    itemlistHTMLString += generateItemElemHTMLString({ appid: appid, contextid: contextid, assetid: assetData.assetid, amount: assetData.amount, img: descript.icon_url, name: descript.name });
                }
            }

            return itemlistHTMLString;
        };

        const generateItemElemHTMLString = (assetData) => {

            let imgUrl = assetData.img ? `https://community.akamai.steamstatic.com/economy/image/${assetData.img}/96fx96f` : '';
            let amountAttr = assetData.amount > 1 ? ` data-amount="${assetData.amount}"` : '';
            return `<div class="inventory-item-container" data-appid="${assetData.appid}" data-contextid="${assetData.contextid}" data-assetid="${assetData.assetid}"${amountAttr}>`
              +     `<img src="${imgUrl}" alt="${assetData.name}" />`
              + '</div>';
        };

        let { data, offerData: { offer }, summaryShortcuts } = TradeofferWindow;

        summaryShortcuts.itemListMe.querySelector('.itemlist-list').innerHTML = generateItemlistHTMLString(data.me.id);
        summaryShortcuts.itemListThem.querySelector('.itemlist-list').innerHTML = generateItemlistHTMLString(data.them.id);
    },
    summaryDetailsDisplayTotals() {
    // Totals is calculated with number of different assets, not individual amounts
        const calculateAppContextTotals = (offerProfileData, isMe) => {
            let meOrPartnerKey = isMe ? 'me' : 'them';
            for(let appid in offerProfileData) {
                for(let contextid in offerProfileData[appid]) {
                    appContextTotals[appid] ??= {};
                    appContextTotals[appid][contextid] ??= { me: 0, them: 0 };

                    let appContextTotal = 0;
                    for(let classid in offerProfileData[appid][contextid]) {
                        appContextTotal += offerProfileData[appid][contextid][classid].assets.length;
                    }

                    appContextTotals[appid][contextid][meOrPartnerKey] = appContextTotal;
                }
            }
        }

        let { data, offerData: { offer }, summaryShortcuts } = TradeofferWindow;

        let appContextTotals = {};
        calculateAppContextTotals(offer[data.me.id], true);
        calculateAppContextTotals(offer[data.them.id], false);

        let tableBodyHTMLString = '';
        let sortedAppids = Object.keys(appContextTotals)
          .map(x => parseInt(x))
          .sort((a, b) => a-b);
        for(let appid of sortedAppids) {
            let appInfo = data.appInfo[appid];
            let rowDataHTMLStrings = Object.keys(appContextTotals[appid])
              .map(x => parseInt(x))
              .sort((a, b) => a-b)
              .map(contextid => {
                let contextTotals = appContextTotals[appid][contextid];
                let contextInfo = appInfo.contexts[contextid];
                if(contextTotals.me === 0 && contextTotals.them === 0) {
                    return '';
                }

                return `<td>${contextInfo.name}</td><td>${contextTotals.me}</td><td>${contextTotals.them}</td>`;
              }).filter(x => x.length);

            if(rowDataHTMLStrings.length === 0) {
                continue;
            }

            rowDataHTMLStrings[0] = `<th scope="row" rowspan="${rowDataHTMLStrings.length}"><img src="${appInfo.icon}"></th>` + rowDataHTMLStrings[0];
            tableBodyHTMLString += rowDataHTMLStrings.reduce((bodyStr, rowStr) => bodyStr + '<tr>' + rowStr + '</tr>', '');
        }

        let tableHTMLString = '<table class="details-section-totals">'
          +     '<thead>'
          +         '<tr>'
          +             '<th class="title" colspan="4">App Item Totals</th>'
          +         '</tr>'
          +         '<tr>'
          +             '<th scope="col">App</th>'
          +             '<th scope="col">Context</th>'
          +             '<th scope="col">Me</th>'
          +             '<th scope="col">Them</th>'
          +         '</tr>'
          +     '</thead>'
          +     '</tbody>'
          +         tableBodyHTMLString
          +     '</tbody>'
          + '</table>';

        let detailsSectionHTMLString = '<div class="summary-details-section">'
          +     '<div class="details-section-body">'
          +         tableHTMLString
          +     '</div>'
          + '</div>';

        summaryShortcuts.details.querySelector('.summary-details-header').insertAdjacentHTML('afterend', detailsSectionHTMLString);
    },
    summaryDetailsDisplayUncommons: function() {
        const findUncommonItems = (isMe) => {
            let meOrPartnerKey = isMe ? 'me' : 'them';
            let offerContextData = offer[data[meOrPartnerKey].id]['753']['6'];
            let descriptions = data.inventories[data[isMe ? 'me' : 'them'].id]['753']['6'].rgDescriptions;
            for(let classid in offerContextData) {
                for(let assetEntry of offerContextData[classid].assets) {
                    let descript = descriptions[`${classid}_${assetEntry.instanceid}`];
                    let isCard = descript.tags?.some(x => x.category === 'item_class' && x.internal_name === 'item_class_2') ?? false;
                    let isUncommon = isCard
                        ? (descript.tags?.some(x => x.category === 'cardborder' && x.internal_name !== 'cardborder_0') ?? false)
                        : (descript.tags?.some(x => x.category === 'droprate' && x.internal_name !== 'droprate_0') ?? false);

                    if(!isUncommon) {
                        continue;
                    }

                    let appName = descript.tags?.find(x => x.category === 'Game')?.name ?? '';
                    let itemTypeName = descript.tags?.find(x => x.category === 'item_class')?.name ?? '';
                    let rarityName = isCard
                        ? (descript.tags?.find(x => x.category === 'cardborder')?.name ?? '')
                        : (descript.tags?.find(x => x.category === 'droprate')?.name ?? '');

                    // NOTE: track amount of rows needed to construct the table
                    uncommonItems[appName] ??= {};
                    uncommonItems[appName][itemTypeName] ??= { rowCount: { me: 0, them: 0 }, rarities: {} };
                    uncommonItems[appName][itemTypeName].rarities[rarityName] ??= { rowCount: { me: 0, them: 0 }, assets: { me: {}, them: {} } };

                    uncommonItems[appName][itemTypeName].rowCount[meOrPartnerKey] += 1;
                    uncommonItems[appName][itemTypeName].rarities[rarityName].rowCount[meOrPartnerKey] += 1;
                    uncommonItems[appName][itemTypeName].rarities[rarityName].assets[meOrPartnerKey][assetEntry.assetid] = { amount: assetEntry.amount, img: descript.icon_url, name: descript.name };
                }
            }
        };

        const customSortKeys = (list, ref) => {
            return list.sort((a, b) => {
                let valA = ref.indexOf(a);
                if(valA === -1) {
                    valA = ref.length;
                }
                let valB = ref.indexOf(b);
                if(valB === -1) {
                    valB = ref.length;
                }
                return valA - valB;
            });
        };

        const generateItemElemHTMLString = (data) => {
            let imgUrl = data.img ? `https://community.akamai.steamstatic.com/economy/image/${data.img}/96fx96f` : '';
            let amountAttr = data.amount > 1 ? ` data-amount="${data.amount}"` : '';
            return `<div class="inventory-item-container"${amountAttr}>`
              +     `<img src="${imgUrl}" alt="${data.name}" />`
              + '</div>';
        };

        let { data, offerData: { offer }, summaryShortcuts } = TradeofferWindow;

        let uncommonItems = {};
        if(offer[data.me.id]?.['753']?.['6']) {
            findUncommonItems(true);
        }
        if(offer[data.them.id]?.['753']?.['6']) {
            findUncommonItems(false);
        }

        let tableHTMLStrings = [];
        let uncommonItemsAppNames = Object.keys(uncommonItems).sort();
        let uncommonItemsItemList = ['Trading card', 'Background', 'Emoticon'];
        let uncommonItemsRarityList = ['Foil', 'Rare', 'Uncommon'];
        for(let appName of uncommonItemsAppNames) {
            let uncommonItemsAppData = uncommonItems[appName];

            let tableBodyHTMLString = '';
            let uncommonItemsAppItemNames = customSortKeys(Object.keys(uncommonItems[appName]), uncommonItemsItemList);
            for(let itemTypeName of uncommonItemsAppItemNames) {
                let uncommonItemsItemTypeData = uncommonItemsAppData[itemTypeName];
                let maxItemTypeRows = Math.max(uncommonItemsItemTypeData.rowCount.me, uncommonItemsItemTypeData.rowCount.them);

                let tableRowHTMLStrings = [];
                let uncommonItemsAppItemRarityNames = customSortKeys(Object.keys(uncommonItemsAppData[itemTypeName].rarities), uncommonItemsRarityList);
                for(let rarityName of uncommonItemsAppItemRarityNames) {
                    let uncommonItemsRarityData = uncommonItemsItemTypeData.rarities[rarityName];
                    let maxRarityRows = Math.max(uncommonItemsRarityData.rowCount.me, uncommonItemsRarityData.rowCount.them);

                    let tableRowHTMLStringsInner = [];
                    let myAssets = Object.keys(uncommonItemsRarityData.assets.me);
                    let theirAssets = Object.keys(uncommonItemsRarityData.assets.them);
                    for(let i=0; i<maxRarityRows; i++) {
                        let myItemHTMLString = '';
                        if(myAssets[i]) {
                            myItemHTMLString = generateItemElemHTMLString(uncommonItemsRarityData.assets.me[myAssets[i]]);
                        }

                        let theirItemHTMLString = '';
                        if(theirAssets[i]) {
                            theirItemHTMLString = generateItemElemHTMLString(uncommonItemsRarityData.assets.them[theirAssets[i]]);
                        }

                        tableRowHTMLStringsInner.push(`<td>${myItemHTMLString}</td><td>${theirItemHTMLString}</td>`);
                    }
                    tableRowHTMLStringsInner[0] = `<td scope="row" rowspan="${maxRarityRows}">${rarityName}</td>` + tableRowHTMLStringsInner[0];
                    tableRowHTMLStrings.push(...tableRowHTMLStringsInner);
                }
                tableRowHTMLStrings[0] = `<td scope="row" rowspan="${maxItemTypeRows}">${itemTypeName}</td>` + tableRowHTMLStrings[0];
                tableBodyHTMLString += tableRowHTMLStrings.reduce((bodyStr, rowStr) => bodyStr + '<tr>' + rowStr + '</tr>', '');
            }

            let tableHTMLString = '<table class="details-section-uncommons-stats">'
              +     '<thead>'
              +         '<tr>'
              +             `<th class="title" colspan="4">${appName}</th>`
              +         '</tr>'
              +         '<tr>'
              +             '<th scope="col">Item Type</th>'
              +             '<th scope="col">Rarity</th>'
              +             '<th scope="col">Me</th>'
              +             '<th scope="col">Them</th>'
              +         '</tr>'
              +     '</thead>'
              +     '</tbody>'
              +         tableBodyHTMLString
              +     '</tbody>'
              + '</table>';

            tableHTMLStrings.push(`<div class="details-section-uncommons">${tableHTMLString}</div>`);
        }

        let detailsSectionHTMLString = '<div class="summary-details-section">'
          +     '<div class="details-section-header">'
          +         '<span class="details-section-title">[Steam] Uncommon Items</span>'
          +     '</div>'
          +     '<div class="details-section-body">'
          +         tableHTMLStrings.join('')
          +     '</div>'
          + '</div>';

        summaryShortcuts.details.querySelector('.summary-details-header').insertAdjacentHTML('afterend', detailsSectionHTMLString);
    },
    summaryDetailsDisplayCardStats: async function() {
    // NOTE: Total/Sets/Cards displays net gain/loss, NOT the amount on one side or another
    // NOTE: Individual card count displays loose cards
        const tallyCardItems = (isMe) => {
            let meOrPartnerKey = isMe ? 'me' : 'them';
            let offerContextData = offer[data[meOrPartnerKey].id]['753']['6'];
            let descriptions = data.inventories[data[isMe ? 'me' : 'them'].id]['753']['6'].rgDescriptions;


            for(let classid in offerContextData) {
                for(let assetEntry of offerContextData[classid].assets) {
                    let descript = descriptions[`${classid}_${assetEntry.instanceid}`];
                    let isCard = descript.tags?.some(x => x.category === 'item_class' && x.internal_name === 'item_class_2') ?? false;
                    if(!isCard) {
                        continue;
                    }

                    let cardborder = descript.tags?.find(x => x.category === 'cardborder');
                    if(!cardborder) {
                        console.warn('TradeofferWindow.summaryDetailsDisplayCardStats(): Cardborder not found for card tag?!?!');
                        continue;
                    }
                    cardborder = cardborder.internal_name.replace('cardborder_', '');

                    cardData[cardborder][descript.market_fee_app] ??= [];
                    let appFoilDataset = cardData[cardborder][descript.market_fee_app];

                    let appFoilData = appFoilDataset.find(x => x.classid === descript.classid);
                    if(!appFoilData) {
                        appFoilData = {
                            classid: classid,
                            descript: descript,
                            count: 0
                        };
                        appFoilDataset.push(appFoilData);
                    }

                    if(isMe) {
                        appFoilData.count -= assetEntry.amount;
                    } else {
                        appFoilData.count += assetEntry.amount;
                    }
                }
            }
        };

        const calcStdDevDiff = (stock, swap, inverseSwap) => {
            if(stock.length !== swap.length) {
                console.warn('TradeofferWindow.summaryDetailsDisplayCardStats(): Different lengths for stock and swap, unable to calculate Std Dev!');
                return;
            }
            let avg = stock.reduce((a, b) => a + b.count, 0.0) / stock.length;
            let stdDevStock = Math.sqrt((stock.reduce((a, b) => a + (b.count ** 2), 0.0) / stock.length) - (avg ** 2));

            let avgSwapCallback, stdDevSwapCallback;
            if(inverseSwap) {
                avgSwapCallback = (a, b, i) => a + (b.count-swap[i]);
                stdDevSwapCallback = (a, b, i) => a + ((b.count-swap[i]) ** 2);
            } else {
                avgSwapCallback = (a, b, i) => a + (b.count+swap[i]);
                stdDevSwapCallback = (a, b, i) => a + ((b.count+swap[i]) ** 2);
            }
            let avgSwap = stock.reduce(avgSwapCallback, 0.0) / stock.length;
            let stdDevSwap = Math.sqrt((stock.reduce(stdDevSwapCallback, 0.0) / stock.length) - (avgSwap ** 2));
            return steamToolsUtils.roundZero(stdDevSwap - stdDevStock);
        };

        const getElemSignClassName = (num, inverse = false) => {
            if(inverse) {
                num = -num;
            }
            return num > 0
              ? 'pos'
              : num < 0
                ? 'neg'
                : 'neut';
        };

        let { data, offerData: { offer }, summaryShortcuts } = TradeofferWindow;

        let cardData = [{}, {}];
        if(offer[data.me.id]?.['753']?.['6']) {
            tallyCardItems(true);
        }
        if(offer[data.them.id]?.['753']?.['6']) {
            tallyCardItems(false);
        }

        let tableHTMLStrings = [];
        let myProfile = await Profile.findProfile(data.me.id);
        let theirProfile = await Profile.findProfile(data.them.id);
        for(let [rarity, foilDataset] of Object.entries(cardData)) {
            for(let appid in foilDataset) {
                let appFoilDataset = foilDataset[appid];
                let appData = await Profile.findAppMetaData(appid, { cards: true, foil: rarity === '1' });
                if(!appData?.cards) {
                    console.error('TradeofferWindow.summaryDetailsDisplayCardStats(): Cards info not found in meta data?!?!', appid);
                    continue;
                }

                // calc total cards in offer
                let totalCards = appFoilDataset.reduce((sum, entry) => sum+entry.count, 0);

                // calc total sets in offer
                let totalSets = 0;
                if(appFoilDataset.length === appData.cards.length) {
                    if(appFoilDataset.every(x => x.count < 0)) {
                        totalSets = Math.max(...appFoilDataset.map(x => x.count))
                    } else if(appFoilDataset.every(x => x.count > 0)) {
                        totalSets = Math.min(...appFoilDataset.map(x => x.count))
                    }
                }

                // sort card list
                let cardCounts = appData.cards.map(cardData => {
                    let appFoilData = appFoilDataset.find(x => x.descript?.icon_url === cardData[`img_card${rarity}`]);
                    return appFoilData ? appFoilData.count : 0;
                });

                // calc std dev of both sides (scrape both badgepages)
                let myStock = await myProfile.getBadgepageStock(appid, rarity === '1');
                let theirStock = await theirProfile.getBadgepageStock(appid, rarity === '1');
                let myStdDiff = calcStdDevDiff(myStock.data, cardCounts, false);
                let theirStdDiff = calcStdDevDiff(theirStock.data, cardCounts, true);

                // only loose cards
                let tableCardCountsRowsHTMLStrings = cardCounts.reduce((html, count, i) => {
                    html.cardNum += `<td>${i+1}</td>`;
                    html.cardAmount += `<td class="${getElemSignClassName(count-totalSets)}">${Math.abs(count-totalSets).toLocaleString()}</td>`;
                    return html;
                }, { cardNum: '', cardAmount: '' });
                tableCardCountsRowsHTMLStrings.cardNum += '<td></td>'.repeat(15-cardCounts.length);
                tableCardCountsRowsHTMLStrings.cardAmount += '<td></td>'.repeat(15-cardCounts.length);

                let tableHTMLString = '<table class="details-section-cards-stats">'
                  +     '<thead>'
                  +         '<tr>'
                  +             `<th class="title" colspan="15">${rarity === '1' ? '★ ' : ''}${appData.name}</th>`
                  +         '</tr>'
                  +     '</thead>'
                  +     '</tbody>'
                  +         '<tr>'
                  +             '<th class="row-name" colspan="2">Total</th>'
                  +             `<td class="row-data ${getElemSignClassName(totalCards)}" colspan="2">${Math.abs(totalCards).toLocaleString()}</td>`
                  +             '<th class="row-name" colspan="2">Sets</th>'
                  +             `<td class="row-data ${getElemSignClassName(totalSets)}" colspan="2">${Math.abs(totalSets).toLocaleString()}</td>`
                  +             '<th class="row-name" colspan="3">Progress</th>'
                  +             `<td class="row-data ${getElemSignClassName(myStdDiff, true)}" colspan="2">${Math.abs(myStdDiff).toFixed(3).toLocaleString()}</td>`
                  +             `<td class="row-data ${getElemSignClassName(theirStdDiff, true)}" colspan="2">${Math.abs(theirStdDiff).toFixed(3).toLocaleString()}</td>`
                  +         '</tr>'
                  +         '<tr class="card-numbers">'
                  +             tableCardCountsRowsHTMLStrings.cardNum
                  +         '</tr>'
                  +         '<tr class="card-counts">'
                  +             tableCardCountsRowsHTMLStrings.cardAmount
                  +         '</tr>'
                  +     '</tbody>'
                  + '</table>';

                tableHTMLStrings.push(`<div class="details-section-cards">${tableHTMLString}</div>`);
            }
        }

        let detailsSectionHTMLString = '<div class="summary-details-section">'
          +     '<div class="details-section-header">'
          +         '<span class="details-section-title">[Steam] Cards</span>'
          +     '</div>'
          +     '<div class="details-section-body">'
          +         tableHTMLStrings.join('')
          +     '</div>'
          + '</div>';

        summaryShortcuts.details.querySelector('.summary-details-header').insertAdjacentHTML('afterend', detailsSectionHTMLString);
    },





    selectorData: {
        blankImg: 'https://community.akamai.steamstatic.com/public/images/economy/blank_gameicon.gif'
    },

    getSelectorData: function() {
        function saveContexts(source, target) {
            for(let appid in source) {
                let contextList = [];
                for(let contextid in source[appid]) {
                    let contextData = source[appid][contextid];
                    if(typeof contextData === 'object' && contextData.asset_count !== 0) {
                        contextList.push(String(contextData.id));
                    }
                }
                if(contextList.length) {
                    target[appid] = contextList;
                }
            }
        }

        let { data, selectorData } = TradeofferWindow;

        if(!selectorData[data.me.id]) {
            selectorData[data.me.id] = {};
            saveContexts(unsafeWindow.UserYou.rgContexts, selectorData[data.me.id]);
        }
        if(!selectorData[data.them.id]) {
            selectorData[data.them.id] = {};
            saveContexts(unsafeWindow.UserThem.rgContexts, selectorData[data.them.id]);
        }
    },
    generateSelectorOptionHTMLString: function(optionText, dataAttr = {}, imgUrl) {
        let dataAttrString = '';
        for(let attr in dataAttr) {
            dataAttrString += ` data-${attr}="${dataAttr[attr]}"`;
        }

        let HTMLString = `<div class="main-control-selector-option userscript-icon-name-container"${dataAttrString}>`;
        if(imgUrl) {
            HTMLString += `<img src="${imgUrl}">`;
        }
        HTMLString += optionText
          + '</div>';

        return HTMLString;
    },
    generateAppSelectorHTMLString: function({ useUserApps = true, usePartnerApps = true, id, placeholderText, disabled = false }) {
        TradeofferWindow.getSelectorData();

        let { data, selectorData } = TradeofferWindow;
        let applist = [];
        let optionsHTMLString = '';

        if(useUserApps) {
            let appInfoYou = unsafeWindow.UserYou.rgAppInfo;
            for(let appid in selectorData[data.me.id]) {
                if(applist.includes(appid)) {
                    continue;
                }

                let appInfo = appInfoYou[appid];
                optionsHTMLString += TradeofferWindow.generateSelectorOptionHTMLString(appInfo.name, { id: appid }, appInfo.icon);
                applist.push(appid);
            }
        }

        if(usePartnerApps) {
            let appInfoThem = unsafeWindow.UserThem.rgAppInfo;
            for(let appid in selectorData[data.them.id]) {
                if(applist.includes(appid)) {
                    continue;
                }

                let appInfo = appInfoThem[appid];
                optionsHTMLString += TradeofferWindow.generateSelectorOptionHTMLString(appInfo.name, { id: appid }, appInfo.icon);
                applist.push(appid);
            }
        }

        let selectorParams = {
            id: id,
            // placeholderData: -1,
            placeholderText: placeholderText || 'Choose App',
            placeholderImg: TradeofferWindow.selectorData.blankImg,
            width: 16,
            disabled: disabled
        };
        return TradeofferWindow.generateSelectorHTMLString(optionsHTMLString, selectorParams);
    },
    generateProfileSelectorHTMLString: function({ id, placeholderText, disabled = false }) {
        let optionsHTMLString = '';
        let myProfileData = TradeofferWindow.data.me;
        let theirProfileData = TradeofferWindow.data.them;
        optionsHTMLString += TradeofferWindow.generateSelectorOptionHTMLString(myProfileData.name, { id: myProfileData.id }, myProfileData.img);
        optionsHTMLString += TradeofferWindow.generateSelectorOptionHTMLString(theirProfileData.name, { id: theirProfileData.id }, theirProfileData.img);

        let selectorParams = {
            id: id,
            // placeholderData: -1,
            placeholderText: placeholderText || 'Choose Profile',
            placeholderImg: TradeofferWindow.selectorData.blankImg,
            width: 12,
            disabled: disabled
        };
        return TradeofferWindow.generateSelectorHTMLString(optionsHTMLString, selectorParams);
    },
    generateContextSelectorHTMLString: function(userIsMe, appid, { id, placeholderText, disabled = false }) {
        TradeofferWindow.getSelectorData();

        let { data, selectorData } = TradeofferWindow;
        let optionsHTMLString = '';
        if( !(userIsMe === undefined || appid === undefined) ) {
            let contextInfoList = unsafeWindow[userIsMe ? 'UserYou' : 'UserThem'].rgAppInfo[appid].rgContexts;

            for(let contextid of selectorData[data[userIsMe ? 'me' : 'them'].id][appid]) {
                let contextInfo = contextInfoList[contextid];
                if(parseInt(contextid) === 0) {
                    continue;
                }
                optionsHTMLString += TradeofferWindow.generateSelectorOptionHTMLString(contextInfo.name, { id: contextInfo.id });
            }
        }

        let selectorParams = {
            id: id,
            placeholderData: -1,
            placeholderText: placeholderText ?? '',
            width: 11,
            disabled: disabled
        };

        return TradeofferWindow.generateSelectorHTMLString(optionsHTMLString, selectorParams);
    },
    generateSelectorHTMLString: function(optionsHTMLString,
      { id, placeholderText = 'Select...', placeholderData = -1, placeholderImg, width, disabled } =
        { placeholderText: 'Select...', placeholderData: -1, /* id, placeholderImg, width */}
    ) {

        if(typeof optionsHTMLString !== 'string') {
            throw 'TradeofferWindow.generateSelectorHTMLString(): invalid data type for optionsHTMLString!';
        }

        let idAttrString = id !== undefined ? `id="${id}"` : '';
        let widthAttrString = width !== undefined ? `style="--selector-width: ${width}em"` : '';
        let selectorDataAttrString = placeholderData !== undefined ? ` data-id="${placeholderData}"` : '';
        let selectorContentHTMLString = (placeholderImg !== undefined ? `<img src="${placeholderImg}">` : '')
          + (placeholderText ?? '');
        let disabledClassString = disabled ? ' disabled' : '';

        return `<div ${idAttrString} class="main-control-selector-container${disabledClassString}" ${widthAttrString} ${selectorDataAttrString}>`
          +     `<div class="main-control-selector-select userscript-icon-name-container">`
          +         selectorContentHTMLString
          +     '</div>'
          +     '<div class="main-control-selector-options">'
          +         optionsHTMLString
          +     '</div>'
          + '</div>';
    },

    generateTagsHTMLStrings: function(tags) {
        const generateTagHTMLString = (tag, i) => {
            return `<div class="prefilter-tag-container" data-id="${tag.id}" data-index="${i}">`
              +     `<span class="prefilter-tag-title">${tag.name}</span>`
              + '</div>';
        };

        let tagsHTMLString = '';
        let tagsHTMLStringExcluded = '';
        for(let i=0; i<tags.length; ++i) {
            let tagData = tags[i];
            if(tagData.excluded) {
                tagsHTMLStringExcluded += generateTagHTMLString(tagData, i);
            } else {
                tagsHTMLString += generateTagHTMLString(tagData, i);
            }
        }

        return [tagsHTMLStringExcluded, tagsHTMLString];
    },
    generateCategoryHTMLString: function(categoryData) {
        let searchbarHTMLString = categoryData.tags.length < TradeofferWindow.MIN_TAG_SEARCH
          ? ''
          : '<div class="prefilter-tag-category-searchbar">'
            +     `<input class="userscript-input" type="text" placeholder="Search ${categoryData.name.toLowerCase()} tags">`
            + '</div>';

        let categoryidAttr = categoryData.id ? ` data-id="${categoryData.id}"` : '';
        let tagsHTMLStrings = TradeofferWindow.generateTagsHTMLStrings(categoryData.tags);

        return `<div class="prefilter-tag-category"${categoryidAttr}>`
          +     `<div class="prefilter-tag-category-title">${categoryData.name}</div>`
          +     searchbarHTMLString
          +     '<div class="prefilter-tag-category-reset">Reset</div>'
          +     '<div class="prefilter-tags-selected">'
          +         tagsHTMLStrings[0]
          +     '</div>'
          +     '<div class="prefilter-tags">'
          +         tagsHTMLStrings[1]
          +     '</div>'
          + '</div>';
    },





    getMarketFilterData: async function(appid) {
        appid = String(appid);
        let configFilterData = TradeofferWindow.filterLookupGet(appid);

        if(configFilterData?.fetched) {
            return configFilterData;
        }

        let urlString = `https://steamcommunity.com/market/appfilters/${appid}`;

        let response = await fetch(urlString);
        let resdata = await response.json();
        if(!resdata.success) {
            throw 'TradeofferWindow.getMarketFilterData(): failed to fetch market filter data!';
        }

        // Why is this an array?
        if(Array.isArray(resdata.facets) ) {
            if(!resdata.facets.length) {
                console.warn('TradeofferWindow.getMarketFilterData(): Why is the data an empty array?');
            } else {
                console.warn('TradeofferWindow.getMarketFilterData(): Why is the data a populated array?');
                console.log(resdata.facets);
            }
            return;
        }

        let filterData = {
            id: appid,
            fetched: true,
            categories: Object.values(resdata.facets).map(categoryData => ({
                id: categoryData.name,
                name: categoryData.localized_name,
                pOpened: false,
                qOpened: false,
                tags: Object.entries(categoryData.tags).map(([tagName, tagData]) => ({
                    id: tagName,
                    name: tagData.localized_name,
                    excluded: false,
                    filtered: false
                }) )
            }) )
        };

        if(!configFilterData) {
            filterData.categories.sort((a, b) => a.tags.length - b.tags.length);
            globalSettings.tradeoffer.filter.apps.push(filterData);
            return filterData;
        }

        // Move over config settings to the new filter data object
        for(let configCategoryData of configFilterData.categories) {
            let filterCategoryData = filterData.categories.find(x => x.id === configCategoryData.id);

            if(!filterCategoryData) {
                filterData.categories.push(configCategoryData);
                continue;
            }

            filterCategoryData.pOpened = configCategoryData.pOpened;
            filterCategoryData.qOpened = configCategoryData.qOpened;
            for(let configTagData of configCategoryData.tags) {
                let filterTagData = filterCategoryData.tags.find(x => x.id === configTagData.id);

                if(!filterTagData) {
                    filterCategoryData.tags.push(configTagData);
                    continue;
                }

                filterTagData.excluded = configTagData.excluded;
                filterTagData.filtered = configTagData.filtered;
            }
        }

        Object.assign(configFilterData, filterData);
        configFilterData.categories.sort((a, b) => a.tags.length - b.tags.length);
        TradeofferWindow.filterLookupUpdateApp(configFilterData);

        return configFilterData;
    },
    getTradeInventory: function(profileid, appid, contextids, filterBlockfn, forceRequest) {
        let { inventories, descriptionClassAssets } = TradeofferWindow.data;
        inventories[profileid] ??= { [appid]: {} };
        inventories[profileid][appid] ??= {};
        descriptionClassAssets[profileid] ??= {};
        descriptionClassAssets[profileid][appid] ??= {};

        if(typeof contextids === 'number' || typeof contextids === 'string') {
            contextids = [String(contextids)];
        } else if(!Array.isArray(contextids)) {
            throw 'TradeofferWindow.getTradeInventoryFast(): invalid data type for contexts!';
        }

        let inventoryCollection = {};
        return contextids.reduce((promise, contextid) => {
            inventoryCollection[contextid] = inventories[profileid][appid][contextid];
            if(!forceRequest && inventoryCollection[contextid] !== undefined) {
                return promise;
            }

            return promise.then(() =>
                TradeofferWindow.requestTradeInventoryFast2(profileid, appid, contextid, filterBlockfn)
                    .then(inventory => {
                        inventories[profileid][appid][contextid] = inventory;

                        let descriptClasses = {};
                        for(let assetid in inventory.rgInventory) {
                            let assetData = inventory.rgInventory[assetid];
                            let classInstance = `${assetData.classid}_${assetData.instanceid}`;
                            descriptClasses[assetData.classid] ??= { count: 0, assets: [], instanceCounts: {} };
                            descriptClasses[assetData.classid].assets.push({ assetid: assetid, instanceid: assetData.instanceid, amount: parseInt(assetData.amount) });
                            descriptClasses[assetData.classid].count += parseInt(assetData.amount);
                            descriptClasses[assetData.classid].instanceCounts[assetData.instanceid] ??= 0;
                            descriptClasses[assetData.classid].instanceCounts[assetData.instanceid] += parseInt(assetData.amount);
                        }
                        descriptionClassAssets[profileid][appid][contextid] = descriptClasses;

                        inventoryCollection[contextid] = inventory;
                    })
            );
        }, Promise.resolve()).then(() => {
            return contextids.length === 1 ? inventoryCollection[contextids[0]] : inventoryCollection;
        });
    },
    requestTradeInventoryFast: function(profileid, appid, contextid, filterBlockFn) {
        // Send requests in regular intervals in an attempt to shorten overall load time for multiple requests
        // Connection speed dependent: someone with a slower connect could accumulate many requests in progress

        const controller = new AbortController();
        const { signal } = controller;

        const delayedFetch = (url, delay, optionalInfo) => {
            return steamToolsUtils.sleep(delay).then(() => {
                if(cancelled) {
                    return null;
                }

                return fetch(url, { signal }).then(
                    response => {
                        if(response.status !== 200) {
                            throw 'TradeofferWindow.getTradeInventoryFast(): status ' + response.status;
                        }
                        return response.json();
                    }
                ).then(
                    data => {
                        return typeof filterBlockFn === 'function' ? filterBlockFn(data, optionalInfo) : data;
                    },
                    err => {
                        cancelled = true;
                        controller.abort();
                        console.error('Fetch error: ' + err);
                        return null;
                    }
                );
            });
        };

        if(typeof contextid !== 'number' && typeof contextid !== 'string') {
            throw 'TradeofferWindow.getTradeInventoryFast(): invalid data type for context!';
        }

        let promises = [];
        let cancelled = false;
        let inventorySize;
        let url;
        let requestCount = 0;

        if(steamToolsUtils.getMySteamId() === profileid) {
            url = new URL(unsafeWindow.g_strInventoryLoadURL + `${appid}/${contextid}`
              + '/?trading=1'
            );
            inventorySize = unsafeWindow.g_rgAppContextData[appid]?.rgContexts[contextid]?.asset_count;
        } else {
            url = new URL(unsafeWindow.g_strTradePartnerInventoryLoadURL
              + '?sessionid=' + steamToolsUtils.getSessionId()
              + '&partner=' + profileid
              + '&appid=' + appid
              + '&contextid=' + contextid
            );
            inventorySize = unsafeWindow.g_rgPartnerAppContextData[appid]?.rgContexts[contextid]?.asset_count;
        }
        inventorySize = parseInt(inventorySize);
        if(!Number.isInteger(inventorySize)) {
            throw `TradeofferWindow.getTradeInventoryFast(): invalid inventory size to be requested: ${inventorySize}`;
        }

        for(let i=0, pages=Math.ceil(inventorySize/2000); i<pages; i++, requestCount++) {
            if(i !== 0) {
                url.searchParams.set('start', i*2000);
            }

            promises.push(delayedFetch(url.href, 250*requestCount, { profileid, appid, contextid }));
        }

        return Promise.all(promises).then(TradeofferWindow.mergeInventory);
    },
    requestTradeInventoryFast2: function(profileid, appid, contextid, filterBlockFn) {
        // Send requests with a maximum number of simultaneous requests at any time
        // Connection speed independent: throttled by number of requests in the task queue

        if(typeof contextid !== 'number' && typeof contextid !== 'string') {
            throw 'TradeofferWindow.getTradeInventoryFast(): invalid data type for context!';
        }

        let urlList = [];
        let inventorySize;
        let url;

        if(steamToolsUtils.getMySteamId() === profileid) {
            url = new URL(unsafeWindow.g_strInventoryLoadURL + `${appid}/${contextid}`
                + '/?trading=1'
            );
            inventorySize = unsafeWindow.g_rgAppContextData[appid]?.rgContexts[contextid]?.asset_count;
        } else {
            url = new URL(unsafeWindow.g_strTradePartnerInventoryLoadURL
                + '?sessionid=' + steamToolsUtils.getSessionId()
                + '&partner=' + profileid
                + '&appid=' + appid
                + '&contextid=' + contextid
            );
            inventorySize = unsafeWindow.g_rgPartnerAppContextData[appid]?.rgContexts[contextid]?.asset_count;
        }
        inventorySize = parseInt(inventorySize);
        if(!Number.isInteger(inventorySize)) {
            throw `TradeofferWindow.getTradeInventoryFast2(): invalid inventory size to be requested: ${inventorySize}`;
        }

        for(let i=0, pages=Math.ceil(inventorySize/2000); i<pages; i++) {
            if(i !== 0) {
                url.searchParams.set('start', i*2000);
            }

            urlList.push({ url: url.href, optionalInfo: { profileid, appid, contextid } });
        }

        return steamToolsUtils.createFetchQueue(urlList, 3, filterBlockFn).then(TradeofferWindow.mergeInventory);
    },
    filterInventoryBlockSetup: function(processAssetfn) {
        function filterInventoryBlock(data, { profileid, appid, contextid }) {
            if(Array.isArray(data?.rgInventory)) {
                if(data.rgInventory.length !== 0) {
                    console.error('TradeofferWindow.filterInventoryBlock(): Inventory data is a populated array?!?!');
                    console.log(data)
                }
                return data;
            }

            let filterData = TradeofferWindow.filterLookupGet(appid);
            if(!filterData) {
                filterData = {
                    id: appid,
                    fetched: false,
                    categories: []
                };
                globalSettings.tradeoffer.filter.apps.push(filterData);
                TradeofferWindow.filterLookupUpdateApp(filterData);
            }

            let excludedDescriptions = [];
            for(let assetid in data.rgInventory) {
                let asset = data.rgInventory[assetid];
                let excludeAsset = false;
                let descript = data.rgDescriptions[`${asset.classid}_${asset.instanceid}`];

                if(!descript) {
                    console.error('TradeofferWindow.filterInventoryBlock(): Description not found for an asset?!?!');
                    continue;
                }

                // check to be excluded or not
                for(let tag of descript.tags) {
                    let filterCategory = TradeofferWindow.filterLookupGet(appid, tag.category);
                    if(!filterCategory) {
                        filterCategory = {
                            id: tag.category,
                            name: tag.category_name,
                            pOpened: false,
                            qOpened: false,
                            tags: []
                        };
                        filterData.categories.push(filterCategory);
                        TradeofferWindow.filterLookupUpdateCategory(appid, filterCategory);
                    }

                    let filterTag = TradeofferWindow.filterLookupGet(appid, tag.category, tag.internal_name);
                    if(!filterTag) {
                        filterTag = {
                            id: tag.internal_name,
                            name: tag.name,
                            excluded: false,
                            filtered: false
                        };
                        filterCategory.tags.push(filterTag);
                        TradeofferWindow.filterLookupUpdateTag(appid, tag.category, filterTag);
                    }

                    if(filterTag.excluded) {
                        excludeAsset = true;
                        break;
                    }
                }

                if(excludeAsset) {
                    delete data.rgInventory[assetid];
                    excludedDescriptions.push(`${asset.classid}_${asset.instanceid}`);
                } else if(typeof processAssetfn === 'function') {
                    processAssetfn(asset, descript);
                }
            }

            for(let descriptid of excludedDescriptions) {
                delete data.rgDescriptions[descriptid];
            }

            return data;
        }

        return filterInventoryBlock;
    },
    mergeInventory: function(invBlocks) {
        if(!Array.isArray(invBlocks)) {
            throw 'TradeofferWindow.getTradeInventoryFast(): Promise.all did not pass an array!?!?';
        }

        let mergedInventory = {
            full_load: true,
            rgInventory: {},
            rgCurrency: {},
            rgDescriptions: {}
        };

        for(let invBlock of invBlocks) {
            if(!invBlock?.success) {
                mergedInventory.full_load = false;
                continue;
            }

            mergedInventory.more = invBlock.more;
            mergedInventory.more_start = invBlock.more_start;

            if(Array.isArray(invBlock.rgInventory)) {
                if(invBlock.rgInventory.length) {
                    console.error('TradeofferWindow.getTradeInventoryFast(): Promise.all inventory block has a populated array?!?!');
                    console.log(invBlock);
                    continue;
                }
            } else {
                Object.assign(mergedInventory.rgInventory, invBlock.rgInventory);
            }

            if(Array.isArray(invBlock.rgCurrency)) {
                if(invBlock.rgCurrency.length) {
                    console.error('TradeofferWindow.getTradeInventoryFast(): Promise.all currency block has a populated array?!?!');
                    console.log(invBlock);
                    continue;
                }
            } else {
                Object.assign(mergedInventory.rgCurrency, invBlock.rgCurrency);
            }

            if(Array.isArray(invBlock.rgDescriptions)) {
                if(invBlock.rgDescriptions.length) {
                    console.error('TradeofferWindow.getTradeInventoryFast(): Promise.all description block has a populated array?!?!');
                    console.log(invBlock);
                    continue;
                }
            } else {
                Object.assign(mergedInventory.rgDescriptions, invBlock.rgDescriptions);
            }
        }

        return mergedInventory;
    },





    configSave: async function() {
        await SteamToolsDbManager.setToolConfig('tradeoffer');
    },
    configLoad: async function() {
        let config = await SteamToolsDbManager.getToolConfig('tradeoffer');
        if(config.tradeoffer) {
            globalSettings.tradeoffer = config.tradeoffer;
            TradeofferWindow.filterLookupReset();
            if(globalSettings.tradeoffer.filter.apps.length) {
                TradeofferWindow.filterLookupUpdateApp(globalSettings.tradeoffer.filter.apps);
            }
        } else {
            TradeofferWindow.configReset();
        }
    },
    configReset: function() {
        globalSettings.tradeoffer = TradeofferWindow.SETTINGSDEFAULTS;
        TradeofferWindow.filterLookupReset();
    },
};
