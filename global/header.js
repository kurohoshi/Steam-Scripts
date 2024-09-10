// ==UserScript==
// @name         Steam Tools (PLACEHOLDER)
// @namespace    https://steamcommunity.com/id/KuroHoshiZ/
// @version      2024-06-10
// @description  Set of tools to help with Steam Community activities
// @author       KurohoshiZ
// @match        *://steamcommunity.com/*
// @exclude      https://steamcommunity.com/chat/
// @exclude      https://steamcommunity.com/tradeoffer/
// @icon         https://avatars.akamai.steamstatic.com/5d8f69062e0e8f51e500cecc6009547675ebc93c_full.jpg
// @connect      asf.justarchi.net
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_log
// @homepageURL  https://github.com/kurohoshi/Steam-Scripts
// @downloadURL  https://raw.githubusercontent.com/kurohoshi/Steam-Scripts/dev/userscript.js
// @updateURL    https://raw.githubusercontent.com/kurohoshi/Steam-Scripts/dev/userscript.js
// ==/UserScript==

// Script inspired by the following Userscripts:
// https://github.com/Rudokhvist/ASF-STM/
// https://github.com/Tithen-Firion/STM-UserScript

// Resources Related to Userscript dev:
// https://stackoverflow.com/questions/72545851/how-to-make-userscript-auto-update-from-private-domain-github

const globalSettings = {};
const GLOBALSETTINGSDEFAULTS = {};
const TOOLS_MENU = [];
const DB_OBJECTSTORE_CONFIGS = [
    { name: 'config', keypath: undefined, autoincr: undefined },
    { name: 'profiles', keypath: undefined, autoincr: undefined, indices: [
        { name: 'url', keyPath: 'url', options: undefined }
    ]},
    { name: 'badgepages', keypath: undefined, autoincr: undefined },
    { name: 'app_data', keypath: undefined, autoincr: undefined },
    { name: 'item_descripts', keypath: undefined, autoincr: undefined },
    { name: 'inventories', keypath: undefined, autoincr: undefined },
    { name: 'item_matcher_results', keypath: undefined, autoincr: undefined },
    { name: 'item_nameids', keypath: undefined, autoincr: undefined }
];

const MONTHS_ARRAY = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
