const TradeofferWindow = {
    SETTINGSDEFAULTS: {
        disabled: [], // disable any unwanted tabs here
        filter: {
            pLastSelected: null,
            qLastSelected: null,
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
    },

    FEATURE_LIST: {
        prefilter: { title: 'Prefilter', tabContent: 'P', entry: 'prefilterSetup' },
        quickSearch: { title: 'Quick Search', tabContent: 'Q', entry: 'quickSearchSetup' },
        itemsSelector: { title: 'Items Selector', tabContent: 'I', entry: 'itemsSelectorSetup' },
        message: { title: 'Message', tabContent: 'M', entry: 'messageSetup' },
        summary: { title: 'Summary', tabContent: 'S', entry: 'summarySetup' },
    },
    MIN_TAG_SEARCH: 20,
    INPUT_DELAY: 400, // ms

    shortcuts: {},
    data: {},

    setup: async function() {
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
        await TradeofferWindow.configLoad();

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
        TradeofferWindow.data.me.name = userEscrowMessage.slice(partnerEscrowMessage.indexOf(partnerName), partnerEscrowMessage.indexOf(partnerName) + partnerName.length - partnerEscrowMessage.length);

        TradeofferWindow.data.them.id = unsafeWindow.UserThem.strSteamId;
        TradeofferWindow.data.them.url = unsafeWindow.UserThem.strProfileURL;
        TradeofferWindow.data.them.img = document.getElementById('trade_theirs').querySelector('.avatarIcon img').src;
        TradeofferWindow.data.me.id = unsafeWindow.UserYou.strSteamId;
        TradeofferWindow.data.me.url = unsafeWindow.UserYou.strProfileURL;
        TradeofferWindow.data.me.img = document.getElementById('trade_yours').querySelector('.avatarIcon img').src;

        // add app entries into filter
        await TradeofferWindow.addAppFilterApps();

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
            if(!globalSettings.tradeoffer.disabled.includes(tabName)) {
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

        let lastSelectedApp = globalSettings.tradeoffer.filter.pLastSelected;
        if(lastSelectedApp) {
            prefilterShortcuts.selectorOptions.querySelector(`[data-id="${lastSelectedApp}"]`)?.click();
        }
    },
    prefilterAppSelectorMenuSelectListener: async function(event) {
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

        globalSettings.tradeoffer.filter.pLastSelected = optionId;
        await TradeofferWindow.configSave();

        // the event bubbling will take care of toggling the selector menu back off
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
        offerItems: { // items already selected in offer
            // appid: {
            //     contextid: { you: [assetids], them: [assetids] }
            // }
        },
        // inventory: {
        //     full_load: boolean
        //     data: array,
        //     dataFiltered: array,
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

        let { quickSearchShortcuts } = TradeofferWindow;

        TradeofferWindow.quickSearchDisplaySelectResetAll();
        TradeofferWindow.quickSearchOfferItemsUpdate();

        if (quickSearchShortcuts.body !== undefined) {
            return;
        }

        // generate prefilter body and attach to overlay body
        const quickSearchMainControlHTMLString = '<div class="quick-search-main-control">'
          +     '<div class="main-control-section">'
          +         TradeofferWindow.generateProfileSelectorHTMLString({ id: 'selector-quick-search-profile' })
          +         TradeofferWindow.generateAppSelectorHTMLString({ useUserApps: false, usePartnerApps: false, id: 'selector-quick-search-app', placeholderText: 'Select profile first', disabled: true })
          +         TradeofferWindow.generateContextSelectorHTMLString(undefined, undefined, { id: 'selector-quick-search-context', placeholderText: 'Select profile/app first', disabled: true })
          +         '<button id="quick-search-load-inventory" class="main-control-selector-action">'
          +             'Load'
          +         '</button>'
          +     '</div>'
          +     '<div class="main-control-section">'
          +         '<button id="quick-search-add-to-offer" class="main-control-selector-action">'
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
        const quickSearchBodyHTMLString = '<div class="quick-search-body">'
          +     quickSearchMainControlHTMLString
          +     quickSearchInventoryFacetHTMLString
          +     quickSearchInventoryDisplayHTMLString
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

        quickSearchShortcuts.facet = document.getElementById('quick-search-facet');

        quickSearchShortcuts.display = quickSearchShortcuts.body.querySelector('.quick-search-inventory-display');
        quickSearchShortcuts.pages = document.getElementById('quick-search-pages');
        quickSearchShortcuts.pageNavigationBar = document.getElementById('quick-search-page-nav');
        quickSearchShortcuts.pageNumbers = quickSearchShortcuts.pageNavigationBar.querySelector('.inventory-page-nav-numbers');

        // add event listeners to everything in the quick search body
        quickSearchShortcuts.selectorProfile.addEventListener('click', TradeofferWindow.selectorMenuToggleListener);
        quickSearchShortcuts.selectorOptionsProfile.addEventListener('click', TradeofferWindow.quickSearchSelectorProfileSelectListener);
        quickSearchShortcuts.selectorApp.addEventListener('click', TradeofferWindow.selectorMenuToggleListener);
        quickSearchShortcuts.selectorOptionsApp.addEventListener('click', TradeofferWindow.quickSearchSelectorAppSelectListener);
        quickSearchShortcuts.selectorContext.addEventListener('click', TradeofferWindow.selectorMenuToggleListener);
        quickSearchShortcuts.selectorOptionsContext.addEventListener('click', TradeofferWindow.selectorMenuSelectListener);

        document.getElementById('quick-search-load-inventory').addEventListener('click', TradeofferWindow.quickSearchLoadInventoryListener);
        document.getElementById('quick-search-add-to-offer').addEventListener('click', TradeofferWindow.quickSearchAddSelectedListener);

        document.getElementById('quick-search-search-inventory').addEventListener('input', steamToolsUtils.debounceFunction(TradeofferWindow.quickSearchFacetSearchInventoryInputListener, TradeofferWindow.INPUT_DELAY));

        quickSearchShortcuts.pages.addEventListener('click', TradeofferWindow.quickSearchDisplaySelectItemsListener);
        quickSearchShortcuts.pageNavigationBar.addEventListener('click', TradeofferWindow.quickSearchDisplayPaginateListener);
    },
    quickSearchOfferItemsUpdate: function() {
        // grab items from both sides and update item list to disable during quick search
        // update disable state for currently rendered items
        let offerItems = {};

        const addOfferItems = (offerItemElemList, isMe) => {
            // go through loaded inventories to update their disabled state also
            for(let offerItemElem of offerItemElemList) {
                let itemData = offerItemElem.rgItem;
                if(!itemData) {
                    console.warn('TradeofferWindow.quickSearchOfferItemsUpdate(): item data not found on item elem??');
                    console.log(offerItemElem);
                    continue;
                }

                offerItems[itemData.appid] ??= {
                    [itemData.contextid]: { you: [], them: [] }
                };
                offerItems[itemData.appid][itemData.contextid] ??= { you: [], them: [] };
                offerItems[itemData.appid][itemData.contextid][isMe ? 'you' : 'them'].push(itemData.id);
            }
        };

        addOfferItems(document.getElementById('your_slots').querySelectorAll('.item'), true);
        addOfferItems(document.getElementById('their_slots').querySelectorAll('.item'), false);
        TradeofferWindow.quickSearchData.offerItems = offerItems;

        let { quickSearchShortcuts, quickSearchData: { currentContext, inventory } } = TradeofferWindow;
        if(!quickSearchShortcuts.body || !currentContext.context) {
            return;
        }

        let offerAssetsList = offerItems[currentContext.app]?.[currentContext.context]?.[currentContext.profile === steamToolsUtils.getMySteamId() ? 'you' : 'them'];
        if(!offerAssetsList) {
            offerAssetsList = [];
        }

        // update inventory data here
        for(let asset of inventory.dataList) {
            if(!asset) {
                continue;
            }
            asset.disabled = offerAssetsList.includes(asset.id);
            asset.selected &&= !asset.disabled;
        }

        // update inventory items in DOM
        for(let itemElem of quickSearchShortcuts.body.querySelectorAll('.inventory-item-container')) {
            let itemData = inventory.data[itemElem.dataset.id];
            if(!itemData) {
                throw 'TradeofferWindow.quickSearchOfferItemsUpdate(): an item in DOM has no item data?!?!';
            }

            if(itemData.disabled) {
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

        // activate loading animation

        // hide facet lists
        quickSearchShortcuts.facet.classList.add('loading');

        // clear inventory display items
        for(let pageElem of quickSearchShortcuts.pages.querySelectorAll('.inventory-page')) {
            TradeofferWindow.quickSearchDisplayPageReset(pageElem);
        }

        let inventory = await TradeofferWindow.getTradeInventoryFast2(profileid, appid, contextid, TradeofferWindow.quickSearchFilterInventoryBlock);
        let inventorySorted = INVENTORY_ITEM_PRIORITY.toSorted(appid, inventory.rgInventory, inventory.rgDescriptions);

        quickSearchData.inventory = {
            full_load: inventory.full_load,
            data: inventory.rgInventory,
            dataList: inventorySorted,
            dataFiltered: [],
            pageCount: 0,
            currency: inventory.rgCurrency,
            descriptions: inventory.rgDescriptions
        }
        quickSearchData.currentContext = {
            profile: profileid,
            app: appid,
            context: contextid
        };

        // set up inventroy display
        TradeofferWindow.quickSearchFacetGenerate(quickSearchData.facet);
        TradeofferWindow.quickSearchApplyFilter();
        TradeofferWindow.quickSearchDisplaySetup();

        // deactivate loading animation

        // show facet lists
        quickSearchShortcuts.facet.classList.remove('loading');

        await TradeofferWindow.configSave();
    },
    quickSearchFilterInventoryBlock: function(data, { profileid, appid, contextid }) {
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
        let { quickSearchData } = TradeofferWindow;
        let { facet: facetList } = quickSearchData;
        let offerItemList = quickSearchData.offerItems?.[appid]?.[contextid]?.[steamToolsUtils.getMySteamId() === profileid ? 'you' : 'them'];

        let excludedDescriptions = [];
        for(let assetid in data.rgInventory) {
            let asset = data.rgInventory[assetid];
            let excludeAsset = false;
            let descript = data.rgDescriptions[`${asset.classid}_${asset.instanceid}`];

            if(!descript) {
                console.error('TradeofferWindow.quickSearchFilterInventoryBlock(): Description not found for an asset?!?!');
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

            if(!excludeAsset) {
                // Add to facet list
                for(let tag of descript.tags) {
                    let filterCategory = TradeofferWindow.filterLookupGet(appid, tag.category);
                    let filterTag = TradeofferWindow.filterLookupGet(appid, tag.category, tag.internal_name);

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

                // flag current offer items
                asset.disabled = offerItemList ? offerItemList.includes(asset.id) : false;
                asset.selected = false;
            } else {
                delete data.rgInventory[assetid];
                excludedDescriptions.push(`${asset.classid}_${asset.instanceid}`);
            }
        }

        for(let descriptid of excludedDescriptions) {
            delete data.rgDescriptions[descriptid];
        }

        return data;
    },

    quickSearchAddSelectedListener: function(event) {
        console.log('quickSearchAddSelectedListener() WIP');

        let { currentContext, inventory } = TradeofferWindow.quickSearchData;
        let steamInventory;
        if(unsafeWindow.UserYou.strSteamId === currentContext.profile) {
            steamInventory = unsafeWindow.UserYou.rgContexts[currentContext.app]?.[currentContext.context]?.inventory?.rgInventory;
        } else if(unsafeWindow.UserThem.strSteamId === currentContext.profile) {
            steamInventory = unsafeWindow.UserThem.rgContexts[currentContext.app]?.[currentContext.context]?.inventory?.rgInventory;
        } else {
            throw 'TradeofferWindow.quickSearchAddSelectedListener(): current inventory does not belong to either trade partners????';
        }

        if(!steamInventory) {
            throw 'TradeofferWindow.quickSearchAddSelectedListener(): steam inventory is not loaded?!?!';
        }

        for(let assetid in inventory.data) {
            let asset = inventory.data[assetid];
            if(!asset.selected) {
                continue;
            }

            let steamAsset = steamInventory[asset.id];
            if(!steamAsset) {
                console.error('TradeofferWindow.quickSearchAddSelectedListener(): steam asset not found?!?!');
                continue;
            }

            unsafeWindow.FindSlotAndSetItem(steamAsset);
        }

        // close overlay
        TradeofferWindow.overlayCloseListener();
    },
    quickSearchSelectorProfileSelectListener: function(event) {
        if(!event.currentTarget.matches('.main-control-selector-options')) {
            throw 'TradeofferWindow.selectorMenuSelectListener(): Not attached to options container!';
        } else if(!event.currentTarget.parentElement.matches('.main-control-selector-container')) {
            throw 'TradeofferWindow.selectorMenuSelectListener(): Options container is not immediate child of selector container!';
        }

        let { quickSearchShortcuts } = TradeofferWindow;

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

        quickSearchShortcuts.selectorApp.classList.remove('disabled', 'active');
        quickSearchShortcuts.selectorApp.dataset.id = '-1';
        quickSearchShortcuts.selectorContext.classList.add('disabled');
        quickSearchShortcuts.selectorContext.classList.remove('active');
        quickSearchShortcuts.selectorContext.dataset.id = '-1';

        let selectorContextSelectElem = quickSearchShortcuts.selectorContext.querySelector('.main-control-selector-select');
        selectorContextSelectElem.textContent = 'Select app first';
        selectorContextSelectElem.dataset.id = '-1';

        let selectorAppSelectElem = quickSearchShortcuts.selectorApp.querySelector('.main-control-selector-select');
        selectorAppSelectElem.innerHTML = `<img src="${TradeofferWindow.selectorData.blankImg}">`
          + 'Select App';
        selectorAppSelectElem.dataset.id = '-1';

        let appOptions, appsData;
        if(selectorElem.dataset.id === unsafeWindow.UserYou.strSteamId) {
            appOptions = TradeofferWindow.selectorData.you;
            appsData = unsafeWindow.UserYou.rgAppInfo;
        } else if(selectorElem.dataset.id === unsafeWindow.UserThem.strSteamId) {
            appOptions = TradeofferWindow.selectorData.them;
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
    },
    quickSearchSelectorAppSelectListener: function(event) {
        if(!event.currentTarget.matches('.main-control-selector-options')) {
            throw 'TradeofferWindow.selectorMenuSelectListener(): Not attached to options container!';
        } else if(!event.currentTarget.parentElement.matches('.main-control-selector-container')) {
            throw 'TradeofferWindow.selectorMenuSelectListener(): Options container is not immediate child of selector container!';
        }

        let { quickSearchShortcuts } = TradeofferWindow;

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
        let contextOptions, contextsData;
        if(profileid === unsafeWindow.UserYou.strSteamId) {
            contextOptions = TradeofferWindow.selectorData.you[appid];
            contextsData = unsafeWindow.UserYou.rgAppInfo[appid].rgContexts;
        } else if(profileid === unsafeWindow.UserThem.strSteamId) {
            contextOptions = TradeofferWindow.selectorData.them[appid];
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
        if(!event.shiftKey && !event.ctrlKey) {
            // let selectedElemList = event.currentTarget.querySelectorAll('.selected');
            // for(let selectedElem of selectedElemList) {
            //     let itemData = inventory.data[selectedElem.dataset.id];
            //     if(itemData) {
            //         itemData.selected = false;
            //     }
            //     selectedElem.classList.remove('selected');
            // }

            // if(!(selectedElemList.length === 1 && itemElem.dataset.id === selectData.lastSelected.dataset.id) && !itemElem.classList.contains('disabled')) {
            //     let itemData = inventory.data[itemElem.dataset.id];
            //     if(itemData) {
            //         itemData.selected = true;
            //         itemElem.classList.add('selected');
            //     }
            // }

            let itemData = inventory.data[itemElem.dataset.id];
            if(itemData) {
                itemData.selected = !itemData.selected;
                itemElem.classList.toggle('selected');
            }
        } else if(event.shiftKey) {
            let prevIndex, currIndex;
            let itemElemList;
            if(mode === 0) {
                itemElemList = itemElem.closest('.inventory-page').querySelectorAll('.inventory-item-container');
            } else {
                itemElemList = event.currentTarget.querySelectorAll('.inventory-item-container');
            }

            for(let i=0; i<itemElemList.length; i++) {
                if(itemElemList[i].dataset.id === selectData.lastSelected?.dataset.id) {
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
                if(itemData?.disabled) {
                    continue;
                }

                itemData.selected = true;
                itemElemList[i].classList.add('selected');
            }
            let itemData = inventory.data[itemElemList[currIndex].dataset.id];
            if(!itemData?.disabled) {
                itemData.selected = true;
                itemElemList[currIndex].classList.add('selected');
            }
        } else if(event.ctrlKey) {
            let itemData = inventory.data[itemElem.dataset.id];
            if(itemData) {
                itemData.selected = !itemData.selected;
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

        for(let assetid in inventory.data) {
            inventory.data[assetid].selected = false;
        }

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
                itemData.selected = false;
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
              +         `<span class="facet-entry-detail">(${entryData.count})</span>`
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

        let { quickSearchData } = TradeofferWindow;
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
            searchText = typeof searchText === 'string' ? searchText.toLowerCase() : '';
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

    quickSearchDisplayModeToggleListener: function(event) {
        // toggle display mode
        // set config data
        TradeofferWindow.quickSearchDisplaySetup();
    },
    quickSearchDisplaySetup: function() {
        let { displayMode } = globalSettings.tradeoffer;
        if(displayMode === undefined) {
            TradeofferWindow.quickSearchDisplaySetupPaging();
            // TradeofferWindow.quickSearchDisplaySetupScrolling();
        }

        let currentMode = TradeofferWindow.quickSearchData.mode;
        if(currentMode === undefined || displayMode !== currentMode) {
            if(displayMode === 0) {
                TradeofferWindow.quickSearchDisplaySetupPaging();
            } else if(displayMode === 1) {
                TradeofferWindow.quickSearchDisplaySetupScrolling();
            }
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
                TradeofferWindow.quickSearchDisplaySelectReset();
                scrollData.observer.disconnect();
                for(let pageElem of scrollData.pages) {
                    pageElem.remove();
                }
                scrollData.pages = [];
                quickSearchShortcuts.display.classList.remove('scrolling');
            }
        }

        quickSearchShortcuts.display.classList.add('paging');
        if(quickSearchData.currentPage) {
            TradeofferWindow.quickSearchDisplayPopulatePage(quickSearchData.currentPage, 1);
            quickSearchShortcuts.pages.prepend(quickSearchData.currentPage);
            quickSearchData.currentPage.classList.add('active');
            pagingData.pages.fg = quickSearchData.currentPage;
        } else {
            // generate 1st page and set active
            let pageFgHTMLString = TradeofferWindow.quickSearchDisplayGeneratePageHTMLString(1);
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
        TradeofferWindow.quickSearchDisplayUpdatePageNavigationBar(1);

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
                TradeofferWindow.quickSearchDisplaySelectReset();
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
            quickSearchShortcuts.pages.scroll(startOffset*pageHeight);
        }

        quickSearchData.mode = 1;
    },
    quickSearchDisplayScrollLoadPage: function(entries) {
        let { quickSearchShortcuts, quickSearchData } = TradeofferWindow;
        let { pageCount, pages } = quickSearchData.scrolling;
        let pageHeightWithoutTop = quickSearchData.display.rows * (5.25+0.5);

        entries.forEach((entry) => {
            if(quickSearchData.mode !== 1) {
                return;
            } else if(!entry.isIntersecting) {
                return;
            }

            let pageNum = entry.target.dataset.page;

            if(pages[0].dataset.page === pageNum) {
                let pageElem = pages.pop();
                pageElem.remove();
                TradeofferWindow.quickSearchDisplayPopulatePage(pageElem, parseInt(pageNum)-1);
                quickSearchShortcuts.pages.prepend(pageElem);
                pages.unshift(pageElem);
                quickSearchData.currentPage = quickSearchData.currentPage.previousElementSibling;
            } else if(pages[pageCount-1].dataset.page === pageNum) {
                let pageElem = pages.shift();
                pageElem.remove();
                TradeofferWindow.quickSearchDisplayPopulatePage(pageElem, parseInt(pageNum)+1);
                quickSearchShortcuts.pages.append(pageElem);
                pages.push(pageElem);
                quickSearchData.currentPage = quickSearchData.currentPage.nextElementSibling;
            }

            // let pageMargin = Math.max(0, parseInt(pages[0].dataset.page)-1);
            // quickSearchShortcuts.pages.style.paddingTop = pageMargin > 0
            //   ? `${(pageMargin*pageHeightWithoutTop) + 0.5}rem`
            //   : '0rem';
        });
    },
    quickSearchDisplayPaginateListener: function(event) {
        let { mode: currentMode, paging: pagingData, inventory: { pageCount: pageNumLast } } = TradeofferWindow.quickSearchData;
        let pages = pagingData.pages;

        if(currentMode !== 0) {
            return;
        } else if(pagingData.isAnimating) {
            return;
        }

        let pageStep = parseInt(event.target.dataset.step);
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

        let imgUrl = descript.icon_url ? `https://community.akamai.steamstatic.com/economy/image/${descript.icon_url}/96fx96f` : '';
        return `<div class="inventory-item-container${itemData.disabled ? ' disabled' : ''}${itemData.selected ? ' selected' : ''}" data-id="${itemData.id}">`
          +     (imgUrl ? `<img src="${imgUrl}">` : descript.name)
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
        itemElem.classList[ itemData.disabled ? 'add' : 'remove' ]('disabled');
        itemElem.classList[ itemData.selected ? 'add' : 'remove' ]('selected');
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
    },
    quickSearchDisplayPageReset: function(pageElem) {
        let itemElemList = pageElem.querySelectorAll('.inventory-item-container');
        for(let itemElem of itemElemList) {
            delete itemElem.dataset.id;
            itemElem.innerHTML = '';
        }

        delete pageElem.dataset.page;
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

        let { selectorData } = TradeofferWindow;

        if(!selectorData.you) {
            selectorData.you = {};
            saveContexts(unsafeWindow.UserYou.rgContexts, selectorData.you);
        }
        if(!selectorData.them) {
            selectorData.them = {};
            saveContexts(unsafeWindow.UserThem.rgContexts, selectorData.them);
        }
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
    generateAppSelectorHTMLString: function({ useUserApps = true, usePartnerApps = true, id, placeholderText, disabled = false }) {
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
                optionsHTMLString += TradeofferWindow.generateSelectorOptionHTMLString(appInfo.name, { id: appid }, appInfo.icon);
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

        let { selectorData } = TradeofferWindow;
        let optionsHTMLString = '';
        if( !(userIsMe === undefined || appid === undefined) ) {
            let contextInfoList = unsafeWindow[userIsMe ? 'UserYou' : 'UserThem'].rgAppInfo[appid].rgContexts;

            for(let contextid of selectorData[userIsMe ? 'you' : 'them'][appid]) {
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
          +     `<div class="main-control-selector-select">`
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
    getTradeInventoryFast: function(profileid, appid, contextids, filterFn) {
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
                        return filterFn ? filterFn(data, optionalInfo) : data;
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

        if(typeof contextids === 'number' || typeof contextids === 'string') {
            contextids = [String(contextids)];
        } else if(!Array.isArray(contextids)) {
            throw 'TradeofferWindow.getTradeInventoryFast(): invalid data type for contexts!';
        }

        let promises = [];
        let cancelled = false;
        let inventorySize;
        let url;
        let requestCount = 0;

        for(let contextid of contextids) {
            if(contextid === '0') {
                continue;
            }

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
        }

        return Promise.all(promises).then(TradeofferWindow.mergeInventory);
    },
    getTradeInventoryFast2: function(profileid, appid, contextids, filterFn) {
        // Send requests with a maximum number of simultaneous requests at any time
        // Connection speed independent: throttled by number of requests in the task queue

        if(typeof contextids === 'number' || typeof contextids === 'string') {
            contextids = [String(contextids)];
        } else if(!Array.isArray(contextids)) {
            throw 'TradeofferWindow.getTradeInventoryFast(): invalid data type for contexts!';
        }

        let urlList = [];
        let inventorySize;
        let url;

        for(let contextid of contextids) {
            if(contextid === '0') {
                continue;
            }

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
        }

        return steamToolsUtils.createFetchQueue(urlList, 3, filterFn).then(TradeofferWindow.mergeInventory);
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
