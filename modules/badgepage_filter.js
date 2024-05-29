GLOBALSETTINGSDEFAULTS.badgepageFilter = {
    applist: {
        // object of appids, array/set of profileids
    },
    includeCacheMatching: false
};
const badgepageFilterShortcuts = {};
const badgepageFilterPageData = {};

function getCardStock(pageElem) {
    if(!pageElem.querySelector('.badge_card_set_cards')) {
        return null;
    }

    let cardStock = [];
    for(let cardEntry of pageElem.querySelectorAll('.badge_card_set_card')) {
        let cardAmount = cardEntry.children[1].childNodes.length === 5 ? parseInt(cardEntry.children[1].childNodes[1].textContent.replace(/[()]/g, '')) : 0;
        cardStock.push(parseInt(cardAmount));
    }

    return cardStock;
}

async function setupBadgepageFilter() {
    Object.assign(badgepageFilterPageData, {
        itemIds: {},
        cardInfoList: [],
        appid: document.querySelector('a.whiteLink:nth-child(5)').href.match(/\d+(?=\/$)/g)[0],
        isFoilPage: window.location.search.includes('border=1'),
        friendsCardStock: {},
        myCardStock: getCardStock(document),
        myMissingCards: new Set(),
        myPossibleCards: new Set()
    });

    let { myCardStock, myMissingCards, myPossibleCards } = badgepageFilterPageData;
    for(let i=0; i<myCardStock.length; i++) {
        if(myCardStock[i]>=2) {
            myPossibleCards.add(i);
        } else if(myCardStock[i]==0) {
            myMissingCards.add(i);
        }
    }

    let config = await SteamToolsDbManager.getToolConfig('badgepageFilter');

    globalSettings.badgepageFilter = config.badgepageFilter ?? steamToolsUtils.deepClone(GLOBALSETTINGSDEFAULTS.badgepageFilter);
    globalSettings.badgepageFilter.applist[badgepageFilterPageData.appid] ??= [];
    badgepageFilterPageData.cachedProfiles = steamToolsUtils.deepClone(globalSettings.badgepageFilter.applist[badgepageFilterPageData.appid]);

    for(let cardEntry of document.querySelectorAll('.badge_card_set_card')) {
        let textNodes = cardEntry.querySelector('.badge_card_set_text').childNodes;
        badgepageFilterPageData.cardInfoList.push({
            name: textNodes[textNodes.length-3].textContent.trim(),
            img: cardEntry.querySelector('img').src
        });
    }

    for(let missingCardElem of document.querySelectorAll('.badge_card_to_collect')) {
        let itemId = parseInt(missingCardElem.querySelector('img').id.slice(9));
        let index = parseInt(missingCardElem.querySelector('.badge_card_collect_text > :last-child').textContent.match(/\d+/)) - 1;
        badgepageFilterPageData.itemIds[index] = itemId;
    }

    addSvgBlock(document.getElementById('responsive_page_template_content'));
    GM_addStyle(cssGlobal);
    GM_addStyle(cssEnhanced);
    GM_addStyle(cssMatcher);

    let friendFilterHTMLString = '<div class="enhanced-options right userscript-vars">'
      +    '<div>'
      +       `<input type="checkbox" id="include-cached-profiles" ${globalSettings.badgepageFilter.includeCacheMatching ? 'checked' : ''}>`
      +       '<label for="include-cached-profiles">Include Past Matches</label>'
      +    '</div>'
      +    '<button id="friend-filter" class="userscript-btn purple wide">Filter Friends</button>'
      +    '<button id="good-swaps" class="userscript-btn purple wide">Display Good Swaps</button>'
      +    '<button id="balance-cards" class="userscript-btn purple wide">Balance Cards</button>'
      +    '<button id="help-others" class="userscript-btn purple wide">Help Friends!</button>'
      + '</div>';
    let headerLinkElem = document.querySelector('.badge_cards_to_collect');
    headerLinkElem.insertAdjacentHTML('beforebegin', friendFilterHTMLString);

    badgepageFilterShortcuts.main = document.querySelector('.badge_row_inner');
    badgepageFilterShortcuts.main.insertAdjacentHTML('beforeend', cssAddThrobber());
    badgepageFilterShortcuts.throbber = document.querySelector('.userscript-throbber');

    document.getElementById('include-cached-profiles').addEventListener('click', badgepageFilterUpdateCacheFlagListener);
    document.getElementById('friend-filter').addEventListener('click', badgepageFilterFilterFriendsWithCardsListener);
    document.getElementById('good-swaps').addEventListener('click', badgepageFilterShowGoodSwapsListener);
    document.getElementById('balance-cards').addEventListener('click', badgepageFilterNeutralOrGoodMatchingListener);
    document.getElementById('help-others').addEventListener('click', badgepageFilterHelpOthersListener);
}

async function badgepageFilterFetchFriend(target) {
    const getPossibleMatches = (stock, partnerMissingCards, partnerPossibleCards) => {
        let minVal = Math.min(...stock);
        let lowestCards = new Set(stock.reduce((arr, x, i) => {
            if(x==minVal) {
                arr.push(i)
            }
            return arr;
        }, []));
        let possibleCards = Array(stock.length);
        for(let i=0; i<possibleCards.length; i++) {
            possibleCards[i] = [];
        }
        for(let partnerMissingCard of partnerMissingCards) {
            for(let partnerPossibleCard of partnerPossibleCards) {
                if(partnerMissingCard==partnerPossibleCard) {
                    throw 'getPossibleMatches(): Missing card and possible card cannot have same index in both, something is wrong!';
                }

                if(stock[partnerMissingCard]<2) {
                    continue;
                }

                if(stock[partnerMissingCard]-stock[partnerPossibleCard] >= 2) {
                    possibleCards[partnerMissingCard].push(partnerPossibleCard);
                }
            }
        }

        return { lowestCards, possibleCards };
    };

    let { friendsCardStock, isFoilPage, myMissingCards, myPossibleCards, appid } = badgepageFilterPageData;
    let profileUrl = target === 'string'
      ? target
      : target.querySelector('.persona').href.match(/(id|profiles)\/[^/]+$/g);

    if(!Object.hasOwn(friendsCardStock, profileUrl)) {
        // let [steamId3, appid, itemId] = profileContainerElem.querySelector('.btn_grey_grey ').onclick.toString().match(/\d+/g);
        let profileBadgepageLink = 'https://steamcommunity.com/' + profileUrl + '/gamecards/' + appid + '/' + (isFoilPage ? '?border=1' : '');
        let response = await fetch(profileBadgepageLink);

        let parser = new DOMParser();
        let doc = parser.parseFromString(await response.text(), "text/html");

        if(!doc.querySelector('.badge_gamecard_page')) {
            friendsCardStock[profileUrl] = null;
            await badgepageFilterProfileCacheRemove(profileUrl);
            return;
        }

        let profileAvatarElem = doc.querySelector('.profile_small_header_texture .playerAvatar');
        let profileName = doc.querySelector('.profile_small_header_texture .profile_small_header_name').textContent.trim();
        let profileState = profileAvatarElem.classList.contains('offline')
          ? 'offline' : profileAvatarElem.classList.contains('online')
          ? 'online' : profileAvatarElem.classList.contains('in-game')
          ? 'in-game' : null;
        let profileImgLink = profileAvatarElem.children[profileAvatarElem.children.length-1].src.replace('_medium', '');

        let profileCardStock = getCardStock(doc);
        let { lowestCards: profileMissingCards, possibleCards: profilePossibleCards } = profileCardStock
          ? getPossibleMatches(profileCardStock, myMissingCards, myPossibleCards)
          : { lowestCards: null, possibleCards: null };

        if(!profileCardStock.some(x => x)) {
            await badgepageFilterProfileCacheRemove(profileUrl);
        } else {
            await badgepageFilterProfileCacheAdd(profileUrl);
        }

        friendsCardStock[profileUrl] = {
            id3: steamId3,
            name: profileName,
            profileLink: 'https://steamcommunity.com/' + profileUrl,
            pfp: profileImgLink,
            state: profileState,
            stock: profileCardStock,
            lowestCards: profileMissingCards,
            possibleCards: profilePossibleCards
        }
    }

    return friendsCardStock[profileUrl];
}

async function badgepageFilterUpdateCacheFlagListener(event) {
    globalSettings.badgepageFilter.includeCacheMatching = event.target.checked;
    await badgepageFilterSaveConfig();
}

// provides only mutually beneficial matches with any duplicates cards being fair game
async function badgepageFilterFilterFriendsWithCardsListener() {
    document.getElementById('friend-filter').disabled = true;

    let { friendsCardStock } = badgepageFilterPageData;

    for(let missingCardElem of document.querySelectorAll('.badge_card_to_collect')) {
        let index = missingCardElem.querySelector('.badge_card_collect_text').lastElementChild.textContent.match(/^\d+/g)[0];
        index = parseInt(index)-1;

        for(let profileContainerElem of missingCardElem.querySelectorAll('.badge_friendwithgamecard')) {
            let profileElem = profileContainerElem.querySelector('.persona');
            let profileUrl = profileElem.href.match(/(id|profiles)\/[^/]+$/g);

            await badgepageFilterFetchFriend(profileContainerElem);

            if(!friendsCardStock[profileUrl]?.stock) {
                profileContainerElem.style.backgroundColor = '#111';
            } else if(!friendsCardStock[profileUrl]?.possibleCards?.[index].length) {
                profileContainerElem.style.display = 'none';
            }
        }
    }
}

// provides only mutually beneficial matches with any duplicates cards being fair game
async function badgepageFilterShowGoodSwapsListener() {
    const generateMatchItemsHTMLString = (indices, priority) => {
        let { cardInfoList } = badgepageFilterPageData;
        return indices.map(x => `<div class="match-item${priority.has(x) ? ' good' : ''}" title="${cardInfoList[x].name}"><img src="${cardInfoList[x].img + '/96fx96f?allow_animated=1'}" alt="${cardInfoList[x].name}"></div>`).join('');
    };
    const generateMatchRowHTMLString = (profileid3, index, goodMatches, priority) => {
        let { appid, itemIds } = badgepageFilterPageData;
        return '<div class="match-item-row align-right">'
        +    '<div class="match-item-list left">'
        +       generateMatchItemsHTMLString(goodMatches, priority)
        +    '</div>'
        +    `<div class="match-item-action trade" title="Offer a Trade..." onclick="StartTradeOffer( ${profileid3}, {for_tradingcard: '${appid + '_' + itemIds[index]}'} );"></div>`
        +    '<div class="match-item-list right">'
        +       generateMatchItemsHTMLString([index], priority)
        +    '</div>'
        + '</div>';
    };
    const generateMatchRowsHTMLString = (profileid3, matches, priority) => matches.map((x, i) => x.length ? generateMatchRowHTMLString(profileid3, i, x, priority) : '').join('');
    async function checkAndDisplayPossibleSingleSwaps(profileUrlString) {
        if(processedFriends.has(profileUrlString)) {
            return;
        }

        let profile = await badgepageFilterFetchFriend(profileUrlString);

        if(!profile?.stock) {
            return;
        } else if(!profile?.possibleCards?.some(x => x.length)) {
            return;
        }

        let profileGoodSwapHTMLString = '<div class="match-container-outer">'
        +    '<div class="match-container max3">'
        +       '<div class="match-header">'
        +          '<div class="match-name">'
        +             `<a href="${profile.profileLink}" class="avatar ${profile.state ?? 'offline'}">`
        +                `<img src="${profile.pfp}">`
        +             '</a>'
        +             profile.name
        +          '</div>'
        +       '</div>'
        +       generateMatchRowsHTMLString(profile.id3, profile.possibleCards, profile.lowestCards)
        +    '</div>'
        + '</div>';
        goodSwapListElem.insertAdjacentHTML('beforeend', profileGoodSwapHTMLString);

        processedFriends.add(profileUrlString);
    }

    document.getElementById('good-swaps').disabled = true;

    let HTMLString = '<div class="badge_detail_tasks footer"></div>'
    + '<div id="good-swaps-results" class="enhanced-section">'
    +    '<div class="enhanced-header">Good Matches</div>'
    +    '<div class="enhanced-body"></div>'
    + '</div>';
    badgepageFilterShortcuts.throbber.insertAdjacentHTML('beforebegin', HTMLString);
    badgepageFilterShortcuts.main.classList.add('loading');

    let { friendsCardStock } = badgepageFilterPageData;
    let processedFriends = new Set();
    let goodSwapListElem = document.querySelector('#good-swaps-results > .enhanced-body');

    for(let profileElem of document.querySelectorAll('.badge_friendwithgamecard')) {
        let profileUrl = profileElem.querySelector('.persona').href.match(/(id|profiles)\/[^/]+$/g)[0];
        checkAndDisplayPossibleSingleSwaps(profileUrl);
    }

    if(globalSettings.includeCacheMatching) {
        for(let profileUrl of badgepageFilterPageData.cachedProfiles) {
            checkAndDisplayPossibleSingleSwaps(profileUrl);
        }
    }

    badgepageFilterShortcuts.main.classList.remove('loading');
}

function badgepageFilterNeutralOrGoodMatchingListener() {
    badgepageFilterBalanceCards('balance-match', 'Balance Cards', false);
}

function badgepageFilterHelpOthersListener() {
    badgepageFilterBalanceCards('helper-match', 'Helping Friends', true);
}

async function badgepageFilterBalanceCards(elemId, headerTitle, helperMode) {
    async function checkAndDisplayPossibleMatches(profileUrlString) {
        if(processedFriends.has(profileUrlString)) {
            return;
        }

        let profile = await badgepageFilterFetchFriend(profileUrlString);

        if(!profile?.stock) {
            return;
        }

        let balanceResult = Matcher.balanceVariance(myCardStock, profile.stock, false, helperMode);
        if(!balanceResult.swap.some(x => x)) {
            return;
        }

        let profileBalancedMatchingHTMLString = badgepageFilterGenerateMatchResultHTML(profile, balanceResult);
        balanceMatchingListElem.insertAdjacentHTML('beforeend', profileBalancedMatchingHTMLString);

        processedFriends.add(profileUrlString);
    }
    if(helperMode) {
        document.getElementById('help-others').disabled = true;
    } else {
        document.getElementById('balance-cards').disabled = true;
    }

    let HTMLString = '<div class="badge_detail_tasks footer"></div>'
    + `<div id="${elemId}" class="enhanced-section">`
    +    `<div class="enhanced-header">${headerTitle}</div>`
    +    '<div class="enhanced-body"></div>'
    + '</div>';
    badgepageFilterShortcuts.throbber.insertAdjacentHTML('beforebegin', HTMLString);
    badgepageFilterShortcuts.main.classList.add('loading');

    let { myCardStock, friendsCardStock } = badgepageFilterPageData;
    let processedFriends = new Set();
    let balanceMatchingListElem = document.querySelector(`#${elemId} > .enhanced-body`);

    for(let profileElem of document.querySelectorAll('.badge_friendwithgamecard')) {
        let profileUrl = profileElem.querySelector('.persona').href.match(/(id|profiles)\/[^/]+$/g)[0];
        checkAndDisplayPossibleMatches(profileUrl);
    }

    if(globalSettings.includeCacheMatching) {
        for(let profileUrl of badgepageFilterPageData.cachedProfiles) {
            checkAndDisplayPossibleMatches(profileUrl);
        }
    }

    badgepageFilterShortcuts.main.classList.remove('loading');
}

function badgepageFilterGenerateMatchResultHTML(profileData, balanceResult) {
    let { cardInfoList } = badgepageFilterPageData;

    const generateMatchItemHTMLString = (qty, i) => {
        return `<div class="match-item" data-qty="${Math.abs(qty)}" title="${cardInfoList[i].name}">`
          +    `<img src="${cardInfoList[i].img + '/96fx96f?allow_animated=1'}" alt="${cardInfoList[i].name}">`
          + '</div>';
    };

    const generateMatchItemsHTMLString = (matchResult, leftSide = true) => {
        return matchResult.map((swapAmount, index) =>
            leftSide
              ? (swapAmount<0 ? generateMatchItemHTMLString(swapAmount, index) : '')
              : (swapAmount>0 ? generateMatchItemHTMLString(swapAmount, index) : '')
        ).join('');
    };

    const generateMatchRowHTMLString = (matchResult) => {
        return '<div class="match-item-row align-right">'
          +    '<div class="match-item-list left">'
          +       generateMatchItemsHTMLString(matchResult, true)
          +    '</div>'
          +    `<div class="match-item-action trade"></div>`
          +    '<div class="match-item-list right">'
          +       generateMatchItemsHTMLString(matchResult, false)
          +    '</div>'
          + '</div>';
    };

    return '<div class="match-container-outer">'
      +    '<div class="match-container">'
      +       '<div class="match-header">'
      +          '<div class="match-name">'
      +             `<a href="${profileData.profileLink}" class="avatar ${profileData.state ?? 'offline'}">`
      +                `<img src="${profileData.pfp}">`
      +             '</a>'
      +             profileData.name
      +          '</div>'
      +       '</div>'
      +       generateMatchRowHTMLString(balanceResult.swap)
      +    '</div>'
      + '</div>';
}

async function badgepageFilterProfileCacheAdd(profileUrl) {
    let { appid } = badgepageFilterPageData;
    globalSettings.badgepageFilter.applist[appid].push(profileUrl);
    await badgepageFilterSaveConfig();
}

async function badgepageFilterProfileCacheRemove(profileUrl) {
    let { appid } = badgepageFilterPageData;
    let cachedProfiles = globalSettings.badgepageFilter.applist[appid];
    cachedProfiles.splice(cachedProfiles.indexOf(profileUrl), 1);
    await badgepageFilterSaveConfig();
}

async function badgepageFilterSaveConfig() {
    await SteamToolsDbManager.setToolConfig('badgepageFilter');
}

async function badgepageFilterLoadConfig() {
    let config = await SteamToolsDbManager.getToolConfig('badgepageFilter');
    if(config.badgepageFilter) {
        globalSettings.badgepageFilter = config.badgepageFilter;
    }
}
