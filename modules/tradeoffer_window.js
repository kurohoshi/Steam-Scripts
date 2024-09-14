const TradeofferWindow = {
    SETTINGSDEFAULTS: {
        disabled: [], // disable any unwanted tabs here
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
        for (let appSelectorOptionElem of document.querySelectorAll('.appselect_options .option > span')) {
            let optionQuantity = parseInt(appSelectorOptionElem.textContent);
            if (optionQuantity === 0) {
                appSelectorOptionElem.parentElement.remove();
            }
        }

        // Add CSS Styles
        GM_addStyle(cssTradeofferwindow);

        // set up overlay
        const overlayHTMLString = '<div class="userscript-trade-overlay">'
            + '<div class="userscript-trade-overlay-header">'
            // the title will be changed when a feature setup is triggered
            + '<span class="userscript-trade-overlay-title">?????</span>'
            + '</div>'
            + '<div class="userscript-trade-overlay-close">'
            + '</div>'
            + '<div class="userscript-trade-overlay-body">'
            + '' // the body will be generated on each feature setup
            + '</div>'
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
                + '<div>'
                + featureData.tabContent
                + '</div>'
                + '</div>';
        };
        let newTabsHTMLString = '';
        for (let tabName in TradeofferWindow.FEATURE_LIST) {
            newTabsHTMLString += generateUserTabHTMLString(tabName, TradeofferWindow.FEATURE_LIST[tabName]);
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
        while (!tabElem.matches('.inventory_user_tab')) {
            if (tabElem.matches('.inventory_user_tabs')) {
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
    overlayCloseListener() {
        TradeofferWindow.shortcuts.overlay.parentElement.classList.remove('overlay');
    },





    prefilterShortcuts: {},

    prefilterSetup: function() {
        console.log('Prefilter WIP');

        if (TradeofferWindow.prefilterShortcuts.body !== undefined) {
            return;
        }

        // generate prefilter body and attach to overlay body
    },





    quickSearchShortcuts: {},

    quickSearchSetup: function() {
        console.log('Quick Search WIP');

        if (TradeofferWindow.quickSearchShortcuts.body !== undefined) {
            return;
        }

        // generate prefilter body and attach to overlay body
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
};
