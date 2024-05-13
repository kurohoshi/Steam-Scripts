const DataCollectors = {};
DataCollectors.scrapePage = async function() {
    const SCRAPER_LUT = [
        { regex: /^\/(id|profiles)\/[^/]+\/?$/, fnName: 'scrapeProfileData' },
        { regex: /^\/(id|profiles)\/[^/]+\/gamecards\/\d+\/?/, fnName: 'scrapeBadgepage' },
        { regex: /^\/market\/listings\/\d+\/[^/]+\/?$/, fnName: 'scrapeItemNameId' }
    ];

    await this.scrapeTradeTokens();

    for(let scraperEntry of SCRAPER_LUT) {
        if(scraperEntry.regex.test(window.location.pathname)) {
            console.log('detected valid scraping target')
            await this[scraperEntry.fnName]();
        }
    }
}
DataCollectors.scrapeProfileData = async function() {
    console.log('scraping profile data')
    if(!/^\/(id|profiles)\/[^/]+\/?$/.test( window.location.pathname)) {
        return;
    }

    let profileData = steamToolsUtils.deepClone(unsafeWindow.g_rgProfileData);
    let profile = await SteamToolsDbManager.getProfiles(profileData.steamid);
    profile = profile[profileData.steamid] ?? {};

    profile.id ??= profileData.steamid;

    profileData.url = profileData.url.replace(/https:\/\/steamcommunity\.com\//g, '');
    switch(true) {
        case profileData.url.startsWith('id'):
            profile.url = profileData.url.replace(/(^id\/)|(\/$)/g, '');
        case profileData.url.startsWith('profiles'): // assuming no customURL if url uses profileid
            profile.name = profileData.personaname;
            if(profile.pastNames && Array.isArray(profile.pastNames) && profile.pastNames[length-1] !== profile.name) {
                profile.pastNames.push(profile.name);
            }
            break;
       default:
           console.warn(`findMoreDataForProfile(): ${JSON.stringify(profileData)} is neither id or custom URL, investigate!`);
           break;
    }

    profileData = document.querySelector('.profile_header .playerAvatar');
    profile.pfp = profileData.querySelector('.playerAvatarAutoSizeInner > img').src.replace(/(https:\/\/avatars\.(cloudflare|akamai)\.steamstatic\.com\/)|(_full\.jpg)/g, '');
    profile.state = profileData.classList.contains("in-game")
      ? 2 : profileData.classList.contains("online")
      ? 1 : profileData.classList.contains("offline")
      ? 0 : null;

    profile.last_updated = Date.now();

    await SteamToolsDbManager.setProfile(profile);
}
DataCollectors.scrapeBadgepage = async function() {
    console.log('scraping badgepage data')

    let appid = window.location.pathname
      .replace(/^\/(id|profiles)\/[^/]+\/gamecards\//, '')
      .match(/^\d+/);
    if(!appid || appid.length>1) {
        console.warn('scrapeItemNameId(): No appid found, or multiple appids found, investigate!');
        return;
    }
    appid = parseInt(appid[0]);

    if(!document.querySelector('.badge_gamecard_page')) {
        let meta = { appid: appid, name: null };
        // if(document.querySelector('.badge_icon')) {
        //    let badgeImg = document.querySelector('.badge_icon').src.replace(/^.*\/public\/images\/badges\/|\.png(\?.+)?/g, '');
        //    meta.badges = { normal: {[`${badgeImg}`]: badgeImg }};
        //    meta.name = document.querySelector('.badge_title').textContent.trim();
        // }
        await Profile.updateAppMetaData(appid, meta, false);
        return;
    }

    let profile = window.location.pathname
      .match(/^\/[^/]+\/[^/]+/g)[0]
      ?.replace(/^\/[^/]+\//, '');
    if(!profile) {
        console.warn('scrapeBadgepage(): Unable to extract profileid or url from pathname!');
        return;
    }
    profile = await Profile.findProfile(profile);

    let savedData = await SteamToolsDbManager.getAppDatas(appid);
    savedData = savedData[appid] ?? { appid: appid, name: null, badges: { normal: {}, foil: {} }, cards: [] };

    let isFoil = window.location.search.includes("border=1");

    savedData.name ??= document.querySelector('a.whiteLink:nth-child(5)').textContent;

    let level = document.querySelector('.badge_info_description :nth-child(2)')?.textContent.trim().match(/\d+/g)[0];
    if(level && !savedData.badges[isFoil?'foil':'normal'][level]) {
        let badgeImg = document.querySelector('.badge_icon');
        badgeImg = badgeImg ? badgeImg.src.replace(/https:\/\/cdn\.(cloudflare|akamai)\.steamstatic\.com\/steamcommunity\/public\/images\/items\//, '') : undefined;
        savedData.badges[isFoil?'foil':'normal'][level] = badgeImg.replace(/^\d+\//, '').replace('.png', '');
    }

    let cardStock = [];
    for(let [index, cardEntry] of document.querySelectorAll('.badge_card_set_card').entries()) {
        let cardAmount = cardEntry.children[1].childNodes.length === 5 ? parseInt(cardEntry.children[1].childNodes[1].textContent.replace(/[()]/g, '')) : 0;
        cardStock[index] = { count: parseInt(cardAmount) };
        savedData.cards[index] ??= {};
        savedData.cards[index].name = cardEntry.children[1].childNodes[cardEntry.children[1].childNodes.length-3].textContent.trim();
        savedData.cards[index][`img_card${isFoil?1:0}`] ??= cardEntry.children[0].querySelector('.gamecard').src.replace(/https:\/\/community\.(cloudflare|akamai)\.steamstatic.com\/economy\/image\//g, '');
        if(!savedData.cards[index][`img_full${isFoil?1:0}`]) {
            let img_full = cardEntry.querySelector('.with_zoom');
            if(img_full) {
                img_full = img_full.outerHTML.match(/onclick="[^"]+"/g)[0];
                img_full = img_full.replaceAll('&quot;', '"');
                img_full = img_full.match(/[^/]+(\.jpg)?/g)[0];
                img_full = img_full.replace('.jpg', '');
                savedData.cards[index][`img_full${isFoil?1:0}`] = img_full;
            }
        }
    }

    console.log(savedData);
    await Profile.updateAppMetaData(appid, savedData, false);
    profile.badgepages[`${isFoil?1:0}`][appid] = cardStock;
}
DataCollectors.scrapeItemNameId = async function() {
    console.log('scraping item nameid data')

    let pathhashname = window.location.pathname
      .replace(/^\/market\/listings\//, '')
      .match(/^\d+\/[^/]+/);
    if(!pathhashname || pathhashname.length>1) {
        console.warn('scrapeItemNameId(): No hashname found, or multiple hashnamess found, investigate!');
        return;
    }

    let itemNameId = document.body.querySelector('.responsive_page_template_content > script:last-of-type').textContent
      .match(/Market_LoadOrderSpread\(\s*?\d+\s*?\)/g)[0]
      .match(/\d+/);
    if(!itemNameId || itemNameId.length!==1) {
        console.warn('scrapeItemNameId(): No id found, or unexpected number of ids found, investigate!');
        return;
    }

    let [hashAppid, hashname] = decodeURIComponent(pathhashname[0]).split('/');
    console.log(hashAppid, hashname, itemNameId[0]);
    await SteamToolsDbManager.setItemNameId(hashAppid, hashname, itemNameId[0]);
}
DataCollectors.scrapeTradeTokens = async function() {
    let tradeURLStrings = document.getElementById('responsive_page_template_content')?.innerHTML.match(/https:\/\/steamcommunity\.com\/tradeoffer\/new\/\?partner=\d{8}&amp;token=\w{8}/g);
    if(tradeURLStrings) {
        for(let urlString of tradeURLStrings) {
            urlString = urlString.replaceAll('&amp;', '&');
            await Profile.addTradeURL(urlString);
        }
    }
    let tradeObjectStrings = document.getElementById('responsive_page_template_content')?.innerHTML.match(/ShowTradeOffer\([^{]*?{[^}]*?}[^)]*?\)/g);
    if(tradeObjectStrings) {
        for(let objString of tradeObjectStrings) {
            objString = objString.match(/{[^}]*?}/g)[0].replaceAll('&quot;', '"');
            objString = JSON.parse(objString);
            await Profile.addTradeURL(objString);
        }
    }
}
