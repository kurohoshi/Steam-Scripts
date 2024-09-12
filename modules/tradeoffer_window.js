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
        Object.assign(userTabElem.style, {
            width: 'auto',
        });
        Object.assign(userTabElem.querySelector('div').style, {
            padding: '0 0.75em',
            textAlign: 'center'
        });
        let partnerTabElem = tabsContainerElem.querySelector('#inventory_select_their_inventory');
        partnerTabElem.innerHTML = '<div>Them</div>';
        Object.assign(partnerTabElem.style, {
            width: 'auto',
            float: 'left'
        });
        Object.assign(partnerTabElem.querySelector('div').style, {
            padding: '0 0.75em',
            textAlign: 'center'
        });

        // remove apps in app inventory selector with 0 items
        for (let appSelectorOptionElem of document.querySelectorAll('.appselect_options .option > span')) {
            let optionQuantity = parseInt(appSelectorOptionElem.textContent);
            if (optionQuantity === 0) {
                appSelectorOptionElem.parentElement.remove();
            }
        }

        // Add CSS Styles

        // set up overlay
        const overlayHTMLString = '<div class="userscript-inventory-overlay">'
            + '<div class="userscript-inventory-overlay-header">'
            // the title will be changed when a feature setup is triggered
            + '<span class="userscript-inventory-overlay-title">?????</span>'
            + '</div>'
            + '<div class="userscript-inventory-overlay-close">'
            + '</div>'
            + '<div class="userscript-inventory-overlay-body">'
            + '' // the body will be generated on each feature setup
            + '</div>'
            + '</div>';

        let tradeAreaElem = document.querySelector('.trade_area');
        tradeAreaElem.insertAdjacentHTML('beforeend', overlayHTMLString);

        // Add tabs to the user_tabs section
        const generateUserTabHTMLString = (featureData) => {
            return `<div class="inventory_user_tab" data-name=${featureData.name}>`
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
        TradeofferWindow.shortcuts.overlay = tradeAreaElem.querySelector('.userscript-inventory-overlay');
        TradeofferWindow.shortcuts.overlayTitle = tradeAreaElem.querySelector('.userscript-inventory-overlay-title');
        TradeofferWindow.shortcuts.overlayBody = tradeAreaElem.querySelector('.userscript-inventory-overlay-body');

        tabsContainerElem.addEventListener('click', TradeofferWindow.selectCustomTabListener);
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
