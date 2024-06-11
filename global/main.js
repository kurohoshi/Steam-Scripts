function generateSuperNav() {
    let navContainer = document.querySelector('#global_header .supernav_container');
    if(!navContainer) {
        return;
    }

    let nextNavHeader = navContainer.querySelector('.submenu_Profile'); // steam modified on 2024/5/2
    if(!nextNavHeader) {
        return;
    }

    let htmlStringHeader = '<a class="menuitem supernav " data-tooltip-type="selector" data-tooltip-content=".submenu_tools">TOOLS</a>';
    let htmlMenu = document.createElement('div');
    htmlMenu.setAttribute('class', 'submenu_tools');
    htmlMenu.setAttribute('style', 'display: none;');
    htmlMenu.setAttribute('data-submenuid', 'tools');
    for(let toolMenuEntry of TOOLS_MENU) {
        htmlMenu.insertAdjacentHTML('beforeend', `<a class="submenuitem" name="${toolMenuEntry.name.toLowerCase().replace(/\s/g, '-')}" ${toolMenuEntry.href ? `href="${toolMenuEntry.href}"` : ''}>${toolMenuEntry.htmlString || toolMenuEntry.name}</a>`);
        if(!toolMenuEntry.href && toolMenuEntry.entryFn) {
            htmlMenu.lastElementChild.addEventListener('click', toolMenuEntry.entryFn);
        }
    }

    nextNavHeader.insertAdjacentElement('afterend', htmlMenu);
    nextNavHeader.insertAdjacentHTML('afterend', htmlStringHeader);

    unsafeWindow.$J(function($) {
        $('#global_header .supernav').v_tooltip({'location':'bottom', 'destroyWhenDone': false, 'tooltipClass': 'supernav_content', 'offsetY':-6, 'offsetX': 1, 'horizontalSnap': 4, 'tooltipParent': '#global_header .supernav_container', 'correctForScreenSize': false});
    });
}

async function main() {
    await SteamToolsDbManager.setup();
    await DataCollectors.scrapePage();

    if(!steamToolsUtils.getMySteamId()) {
        return;
    }

    if(/^\/(id|profiles)\/[^/]+\/gamecards\/\d+\/?/.test(window.location.pathname) && document.querySelector('.badge_card_set_card')) {
        setupBadgepageFilter();
    }

    if(window.location.pathname.includes('/tradingcards/boostercreator/enhanced')) {
        setupBoosterCrafter();
    }

    generateSuperNav();
}

setTimeout(main, 0); // macrotask
