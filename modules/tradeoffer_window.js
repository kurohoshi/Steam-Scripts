const TradeofferWindow = {
    SETTINGSDEFAULTS: {
        disabled: [], // disable any unwanted tabs here
        /* filter: {
         *     pLastSelected: string,
         *     qLastSelected: string,
         *     apps: [
         *         { // app
         *             id: string,
         *             fetched: boolean,
         *             categories: [
         *                 { // category
         *                     id: string,
         *                     name: string,
         *                     pOpened: boolean,
         *                     qOpened: boolean,
         *                     tags: [
         *                         { // tag
         *                             id: string,
         *                             name: string,
         *                             excluded: boolean,
         *                             filtered: boolean
         *                         },
         *                         ...
         *                     ]
         *                 },
         *                 ...
         *             ]
         *         },
         *         ...
         *     ]
         * }
         */
    },

    FEATURE_LIST: {
        prefilter: { title: 'Prefilter', tabContent: 'P', entry: 'prefilterSetup' },
        quickSearch: { title: 'Quick Search', tabContent: 'Q', entry: 'quickSearchSetup' },
        itemsSelector: { title: 'Items Selector', tabContent: 'I', entry: 'itemsSelectorSetup' },
        message: { title: 'Message', tabContent: 'M', entry: 'messageSetup' },
        summary: { title: 'Summary', tabContent: 'S', entry: 'summarySetup' },
    },

    shortcuts: {},
    data: {},

    setup: function() {
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
        GM_addStyle(cssTradeofferWindow);

        // load config
        let config = await SteamToolsDbManager.getToolConfig('tradeofferConfig');
        if(config.tradeofferConfig) {
            globalSettings.tradeofferConfig = config.tradeofferConfig;
        } else {
            globalSettings.tradeofferConfig = steamToolsUtils.deepClone(SteamItemMatcher.SETTINGSDEFAULTS.tradeofferConfig);
        }

        // set up overlay
        const overlayHTMLString = '<div class="userscript-trade-overlay">'
          +     '<div class="userscript-trade-overlay-header">'
                  // the title will be changed when a feature setup is triggered
          +         '<span class="userscript-trade-overlay-title">?????</span>'
          +     '</div>'
          +     '<div class="userscript-trade-overlay-close">'
          +     '</div>'
          +     '<div class="userscript-trade-overlay-body">'
          +         '' // the body will be generated on each feature setup
          +     '</div>'
          + '</div>';

        let tradeAreaElem = document.querySelector('.trade_area');
        tradeAreaElem.insertAdjacentHTML('beforeend', overlayHTMLString);

        // Get names, ids, urls for both parties in the trade offer window
        // NOTE: Since we don't have immediate access to user's own name, we resort to extracting it out of the hidden escrow message
        Object.assign(TradeofferWindow.data, { me: {}, them: {} });
        let partnerName = TradeofferWindow.data.them.name = document.getElementById('trade_theirs').querySelector('.offerheader h2 > a').textContent;
        let partnerEscrowMessage = document.getElementById('trade_escrow_for_them').textContent;
        let userEscrowMessage = document.getElementById('trade_escrow_for_me').textContent;
        TradeofferWindow.data.me.name = userEscrowMessage.slice(partnerEscrowMessage.indexOf(partnerName), partnerEscrowMessage.indexOf(partnerName) + partnerName.length - partnerEscrowMessage.length)

        TradeofferWindow.data.them.id = unsafeWindow.UserThem.strSteamId;
        TradeofferWindow.data.them.url = unsafeWindow.UserThem.strProfileURL;
        TradeofferWindow.data.them.img = document.getElementById('trade_theirs').querySelector('.avatarIcon img').src;
        TradeofferWindow.data.me.id = unsafeWindow.UserYou.strSteamId;
        TradeofferWindow.data.me.url = unsafeWindow.UserYou.strProfileURL;
        TradeofferWindow.data.me.img = document.getElementById('trade_yours').querySelector('.avatarIcon img').src;

        // Add tabs to the user_tabs section
        const generateUserTabHTMLString = (featureName, featureData) => {
            return `<div class="inventory_user_tab userscript-tab" data-name=${featureName}>`
              +     '<div>'
              +         featureData.tabContent
              +     '</div>'
              + '</div>';
        };
        let newTabsHTMLString = '';
        for(let tabName in TradeofferWindow.FEATURE_LIST) {
            if(!globalSettings.tradeofferConfig.disabled.includes(tabName)) {
                newTabsHTMLString += generateUserTabHTMLString(tabName, TradeofferWindow.FEATURE_LIST[tabName]);
            }
        }

        // tabsContainerElem.querySelector('[style="clear: both;"]')
        tabsContainerElem.querySelector('.inventory_user_tab_gap')
            .insertAdjacentHTML('beforebegin', newTabsHTMLString);

        TradeofferWindow.shortcuts.userSelectTabs = tabsContainerElem;
        TradeofferWindow.shortcuts.overlay = tradeAreaElem.querySelector('.userscript-trade-overlay');
        TradeofferWindow.shortcuts.overlayTitle = tradeAreaElem.querySelector('.userscript-trade-overlay-title');
        TradeofferWindow.shortcuts.overlayBody = tradeAreaElem.querySelector('.userscript-trade-overlay-body');

        tabsContainerElem.addEventListener('click', TradeofferWindow.selectCustomTabListener);
        TradeofferWindow.shortcuts.overlay.querySelector('.userscript-trade-overlay-close').addEventListener('click', TradeofferWindow.overlayCloseListener);
    },
    selectCustomTabListener: function(event) {
        let tabElem = event.target;
        while(!tabElem.matches('.inventory_user_tab')) {
            if(tabElem.matches('.inventory_user_tabs')) {
                console.error('TradeofferWindow.selectCustomTabListener(): No tab element found!');
                return;
            }
            tabElem = tabElem.parentElement;
        }

        let tabData = TradeofferWindow.FEATURE_LIST[tabElem.dataset.name];
        if (!tabData || (typeof TradeofferWindow[tabData.entry] !== 'function')) {
            throw 'TradeofferWindow.selectCustomTabListener(): Invalid function name! Was something set up incorrectly?';
        }

        TradeofferWindow.shortcuts.overlayTitle.textContent = tabData.title;

        TradeofferWindow[tabData.entry]();

        TradeofferWindow.shortcuts.overlayBody.dataset.name = tabElem.dataset.name;
        TradeofferWindow.shortcuts.overlay.parentElement.classList.add('overlay');
    },





    overlayCloseListener: function() {
        TradeofferWindow.shortcuts.overlay.parentElement.classList.remove('overlay');
    },
    selectorMenuToggleListener: function(event) {
        if(!event.currentTarget.matches('.main-control-selector-container')) {
            throw 'TradeofferWindow.selectorMenuToggle(): Not attached to selector container!';
        }

        event.currentTarget.classList.toggle('active');
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

        selectorElem.querySelector('.main-control-selector-select').innerHTML = option.innerHTML;
        Object.assign(selectorElem.dataset, option.dataset);
    },





    prefilterShortcuts: {},

    prefilterSetup: function() {
        console.log('Prefilter WIP');

        if (TradeofferWindow.prefilterShortcuts.body !== undefined) {
            return;
        }

        // generate prefilter body and attach to overlay body
        const prefilterBodyHTMLString = '<div class="prefilter-body">'
          +     '<div class="prefilter-main-control">'
          +         '<div class="main-control-section">'
          +             TradeofferWindow.generateAppSelectorHTMLString()
          +         '</div>'
          +     '</div>'
          +     '<div class="prefilter-tag-category-containers">'
          +         '' // populated when an app is selected
          +     '</div>'
          + '</div>';

        TradeofferWindow.shortcuts.overlayBody.insertAdjacentHTML('beforeend', prefilterBodyHTMLString);

        // add shortcuts to parts of the prefilter body

        // add event listeners to everything in the prefilter body
    },





    quickSearchShortcuts: {},

    quickSearchSetup: function() {
        console.log('Quick Search WIP');

        if (TradeofferWindow.quickSearchShortcuts.body !== undefined) {
            return;
        }

        // generate prefilter body and attach to overlay body
        const quickSearchMainControlHTMLString = '<div class="quick-search-main-control">'
          +     '<div class="main-control-section">'
          +         TradeofferWindow.generateUserSelectorHTMLString()
          +         '' // app selection is added when a user is selected
          +         '' // context selection is added when an app is selected
          +         '<button class="main-control-selector-action">'
          +             'Load'
          +         '</button>'
          +     '</div>'
          +     '<div class="main-control-section">'
          +         '<button class="main-control-selector-action">'
          +             'Add Selected'
          +         '</button>'
          +     '</div>'
          + '</div>';
        const quickSearchInventoryFacetHTMLString = '<div class="quick-search-inventory-facet">'
          +     '<input class="userscript-input" type="text" placeholder="Search item name">'
          +     '' // tag categories is generated when inventory is loaded
          + '</div>';
        const quickSearchInventoryDisplayHTMLString = '<div class="inventory-display-container">'
          +     '<div class="inventory-pages-container">'
          +         '' // pages will be set up on display mode selection
          +     '</div>'
          +     '<div class="inventory-page-nav">'
          +         '<button class="inventory-page-nav-btn" data-step="-Infinity">|&lt</button>'
          +         '<button class="inventory-page-nav-btn" data-step="-10">&lt&lt</button>'
          +         '<button class="inventory-page-nav-btn" data-step="-1">&lt</button>'
          +         '<div class="inventory-page-nav-numbers">'
          +             '<span class="inventory-page-nav-text number first">1</span>'
          +             '<span class="inventory-page-nav-text ellipsis">...</span>'
          +             '<span class="inventory-page-nav-text number">50</span>'
          +             '<span class="inventory-page-nav-text number current">51</span>'
          +             '<span class="inventory-page-nav-text number">52</span>'
          +             '<span class="inventory-page-nav-text ellipsis">...</span>'
          +             '<span class="inventory-page-nav-text number last">1000</span>'
          +         '</div>'
          +         '<button class="inventory-page-nav-btn" data-step="1">&gt</button>'
          +         '<button class="inventory-page-nav-btn" data-step="10">&gt&gt</button>'
          +         '<button class="inventory-page-nav-btn" data-step="Infinity">&gt|</button>'
          +     '</div>'
          + '</div>';
        const quickSearchBodyHTMLString = '<div class="quick-search-body">'
          +     quickSearchMainControlHTMLString
          +     quickSearchInventoryFacetHTMLString
          +     quickSearchInventoryDisplayHTMLString
          + '</div>';

        TradeofferWindow.shortcuts.overlayBody.insertAdjacentHTML('beforeend', quickSearchBodyHTMLString);

        // add shortcuts to parts of the quick search body

        // add event listeners to everything in the quick search body
    },





    itemsSelectorShortcuts: {},

    itemsSelectorSetup: function() {
        console.log('Items Selector WIP');

        if (TradeofferWindow.itemsSelectorShortcuts.body !== undefined) {
            return;
        }

        // generate prefilter body and attach to overlay body
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

    summarySetup: function() {
        console.log('Summary WIP');

        if (TradeofferWindow.summaryShortcuts.body !== undefined) {
            return;
        }

        // generate prefilter body and attach to overlay body
    },





    selectorData: undefined,
    getSelectorData: function() {
        function saveContexts(source, target) {
            for(let appid in source) {
                let contextList = [];
                for(let contextid in source[appid]) {
                    let contextData = source[appid][contextid];
                    if(typeof contextData === 'object' && (contextData.asset_count !== 0 && contextData.trade_permissions !== 'NONE')) {
                        contextList.push(contextData.id);
                    }
                }
                if(contextList.length) {
                    target[appid] = contextList;
                }
            }
        }

        if(TradeofferWindow.selectorData) {
            return;
        }

        let selectorData = TradeofferWindow.selectorData = {
            you: {},
            them: {}
        };

        saveContexts(unsafeWindow.UserYou.rgContexts, selectorData.you);
        saveContexts(unsafeWindow.UserThem.rgContexts, selectorData.them);
    },
    generateSelectorOptionHTMLString: function(optionText, dataAttr = {}, imgUrl) {
        let dataAttrString = '';
        for(let attr in dataAttr) {
            dataAttrString += ` data-${attr}="${dataAttr[attr]}"`;
        }

        let HTMLString = `<div class="main-control-selector-option"${dataAttrString}>`;
        if(imgUrl) {
            HTMLString += `<img src="${imgUrl}">`;
        }
        HTMLString += optionText
          + '</div>';

        return HTMLString;
    },
    generateAppSelectorHTMLString: function(useUserApps = true, usePartnerApps = true) {
        TradeofferWindow.getSelectorData();

        let { selectorData } = TradeofferWindow;
        let applist = [];
        let optionsHTMLString = '';

        if(useUserApps) {
            let appInfoYou = unsafeWindow.UserYou.rgAppInfo;
            for(let appid in selectorData.you) {
                if(applist.includes(appid)) {
                    continue;
                }

                let appInfo = appInfoYou[appid];
                optionsHTMLString += TradeofferWindow.generateSelectorOptionHTMLString(appInfo.name, { appid: appid }, appInfo.icon);
                applist.push(appid);
            }
        }

        if(usePartnerApps) {
            let appInfoThem = unsafeWindow.UserThem.rgAppInfo;
            for(let appid in selectorData.them) {
                if(applist.includes(appid)) {
                    continue;
                }

                let appInfo = appInfoThem[appid];
                optionsHTMLString += TradeofferWindow.generateSelectorOptionHTMLString(appInfo.name, { appid: appid }, appInfo.icon);
                applist.push(appid);
            }
        }

        return '<div class="main-control-selector-container" style="--selector-width: 15em">'
          +     '<div class="main-control-selector-select"></div>'
          +     '<div class="main-control-selector-options">'
          +         optionsHTMLString
          +     '</div>'
          + '</div>';
    },
    generateUserSelectorHTMLString: function() {
        let optionsHTMLString = '';
        let myProfileData = TradeofferWindow.data.me;
        let theirProfileData = TradeofferWindow.data.them;
        optionsHTMLString += TradeofferWindow.generateSelectorOptionHTMLString(myProfileData.name, { id: myProfileData.id }, myProfileData.img);
        optionsHTMLString += TradeofferWindow.generateSelectorOptionHTMLString(theirProfileData.name, { id: theirProfileData.id }, theirProfileData.img);

        return '<div class="main-control-selector-container" style="--selector-width: 10em">'
          +     '<div class="main-control-selector-select"></div>'
          +     '<div class="main-control-selector-options">'
          +         optionsHTMLString
          +     '</div>'
          + '</div>';
    },
    generateContextSelectorHTMLString: function(userIsMe, appid) {
        TradeofferWindow.getSelectorData();

        let { selectorData } = TradeofferWindow;
        let optionsHTMLString = '';
        let contextInfoList = unsafeWindow[userIsMe ? 'UserYou' : 'UserThem'].rgAppInfo[appid].rgContexts;

        for(let contextid of selectorData[userIsMe ? 'you' : 'them'][appid]) {
            let contextInfo = contextInfoList[contextid];
            optionsHTMLString += TradeofferWindow.generateSelectorOptionHTMLString(contextInfo.name, { id: contextInfo.id });
        }

        return '<div class="main-control-selector-container" style="--selector-width: 10em">'
          +     '<div class="main-control-selector-select"></div>'
          +     '<div class="main-control-selector-options">'
          +         optionsHTMLString
          +     '</div>'
          + '</div>';
    },





    getMarketFilterData: async function(appid) {
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
            id: String(appid),
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

        let configFilterData = globalSettings.tradeofferConfig.filter.apps.find(x => x.id === filterData.id);
        if(!configFilterData) {
            globalSettings.tradeofferConfig.filter.apps.push(filterData);
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
            for(let configTagData of configFilterData.tags) {
                let filterTagData = filterCategoryData.tags.find(x => x.id === configTagData.id);

                if(!filterTagData) {
                    filterCategoryData.tags.push(configTagData);
                }

                filterTagData.excluded = configTagData.excluded;
                filterTagData.filtered = configTagData.filtered;
            }
        }

        Object.assign(configFilterData, filterData);
        return configFilterData;
    },
};
