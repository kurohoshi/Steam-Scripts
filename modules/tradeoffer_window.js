const TradeofferWindow = {
    SETTINGSDEFAULTS: {
        disabled: [], // disable any unwanted tabs here
    },

    FEATURE_LIST: [
        { name: 'prefilter', title: 'P', entry: 'prefilterSetup' },
        { name: 'quickSearch', title: 'Q', entry: 'quickSearchSetup' },
        { name: 'itemsSelector', title: 'I', entry: 'itemsSelectorSetup' },
        { name: 'message', title: 'M', entry: 'messageSetup' },
        { name: 'summary', title: 'S', entry: 'summarySetup' },
    ],

    shortcuts: {},

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

        // Add tabs to the user_tabs section
        const generateUserTabHTMLString = (featureData) => {
            return `<div class="inventory_user_tab userscript-tab" data-name=${featureData.name}>`
                + '<div>'
                + featureData.title
                + '</div>'
                + '</div>';
        };
        const newTabsHTMLString = TradeofferWindow.FEATURE_LIST
            .map(x => generateUserTabHTMLString(x))
            .join('');

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
            if (tabElem.matches('inventory_user_tabs')) {
                throw 'TradeofferWindow.selectCustomTabListener(): No tab found! Was the document structured correctly?';
            }
            tabElem = tabElem.parentElement;
        }

        let entryFunctionName = TradeofferWindow.FEATURE_LIST.find(x => tabElem.dataset.name === x.name)?.entry;
        if (!entryFunctionName || (typeof TradeofferWindow[entryFunctionName] !== 'function')) {
            throw 'TradeofferWindow.selectCustomTabListener(): Invalid function name! Was something set up incorrectly?';
        }

        TradeofferWindow[entryFunctionName]();

        TradeofferWindow.shortcuts.overlay.parentElement.classList.add('overlay');
    },
    overlayCloseListener() {
        TradeofferWindow.shortcuts.overlay.parentElement.classList.remove('overlay');
    },

    prefilterSetup: function() {
        console.log('Prefilter WIP');
    },
    quickSearchSetup: function() {
        console.log('Quick Search WIP');
    },
    itemsSelectorSetup: function() {
        console.log('Items Selector WIP');
    },
    messageSetup: function() {
        console.log('Message WIP');
    },
    summarySetup: function() {
        console.log('Summary WIP');
    },
};
