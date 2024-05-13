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
    globalSettings.badgepageFilter = {
        itemIds: {},
        cardInfoList: [],
        appid: document.querySelector('a.whiteLink:nth-child(5)').href.match(/\d+(?=\/$)/g)[0],
        isFoilPage: window.location.search.includes('border=1'),
        friendsCardStock: {},
        myCardStock: getCardStock(document),
        myMissingCards: new Set(),
        myPossibleCards: new Set()
    };

    let { myCardStock, myMissingCards, myPossibleCards } = globalSettings.badgepageFilter;
    for(let i=0; i<myCardStock.length; i++) {
        if(myCardStock[i]>=2) {
            myPossibleCards.add(i);
        } else if(myCardStock[i]==0) {
            myMissingCards.add(i);
        }
    }

    for(let cardEntry of document.querySelectorAll('.badge_card_set_card')) {
        let textNodes = cardEntry.querySelector('.badge_card_set_text').childNodes;
        globalSettings.badgepageFilter.cardInfoList.push({
            name: textNodes[textNodes.length-3].textContent.trim(),
            img: cardEntry.querySelector('img').src
        });
    }

    for(let missingCardElem of document.querySelectorAll('.badge_card_to_collect')) {
        let itemId = parseInt(missingCardElem.querySelector('img').id.slice(9));
        let index = parseInt(missingCardElem.querySelector('.badge_card_collect_text > :last-child').textContent.match(/\d+/)) - 1;
        globalSettings.badgepageFilter.itemIds[index] = itemId;
    }

    addSvgBlock(document.getElementById('responsive_page_template_content'));
    GM_addStyle(cssGlobal);
    GM_addStyle(cssEnhanced);
    GM_addStyle(cssMatcher);

    let friendFilterHTMLString = '<div class="enhanced-options right userscript-vars">'
    +    '<button id="friend-filter" class="userscript-btn purple wide">Filter Friends</button>'
    +    '<button id="good-swaps" class="userscript-btn purple wide">Display Good Swaps</button>'
    +    '<button id="balance-cards" class="userscript-btn purple wide">Balance Cards</button>'
    + '</div>';
    let headerLinkElem = document.querySelector('.badge_cards_to_collect');
    headerLinkElem.insertAdjacentHTML('beforebegin', friendFilterHTMLString);
    document.getElementById('friend-filter').addEventListener('click', badgepageFilterFilterFriendsWithCardsListener);
    document.getElementById('good-swaps').addEventListener('click', badgepageFilterShowGoodSwapsListener);
    document.getElementById('balance-cards').addEventListener('click', badgepageFilterBalanceCardsListener);
}

async function badgepageFilterFetchFriend(profileContainerElem) {
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

    let { friendsCardStock, isFoilPage, myMissingCards, myPossibleCards } = globalSettings.badgepageFilter;
    let profileElem = profileContainerElem.querySelector('.persona');
    let profileUrl = profileElem.href.match(/(id|profiles)\/[^/]+$/g);

    if(!Object.hasOwn(friendsCardStock, profileUrl)) {
        let [steamId3, appid, itemId] = profileContainerElem.querySelector('.btn_grey_grey ').onclick.toString().match(/\d+/g);
        let profileBadgepageLink = profileElem.href + '/gamecards/' + appid + '/' + (isFoilPage ? '?border=1' : '');
        let response = await fetch(profileBadgepageLink);

        let parser = new DOMParser();
        let doc = parser.parseFromString(await response.text(), "text/html");

        if(!doc.querySelector('.badge_gamecard_page')) {
            friendsCardStock[profileUrl] = null;
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

        friendsCardStock[profileUrl] = {
            id3: steamId3,
            name: profileName,
            profileLink: profileElem.href,
            pfp: profileImgLink,
            state: profileState,
            stock: profileCardStock,
            lowestCards: profileMissingCards,
            possibleCards: profilePossibleCards
        }
    }

    return friendsCardStock[profileUrl];
}

// provides only mutually beneficial matches with any duplicates cards being fair game
async function badgepageFilterFilterFriendsWithCardsListener() {
    // remove/disable button

    let { friendsCardStock } = globalSettings.badgepageFilter;

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
        let { cardInfoList } = globalSettings.badgepageFilter;
        return indices.map(x => `<div class="match-item${priority.has(x) ? ' good' : ''}" title="${cardInfoList[x].name}"><img src="${cardInfoList[x].img + '/96fx96f?allow_animated=1'}" alt="${cardInfoList[x].name}"></div>`).join('');
    };
    const generateMatchRowHTMLString = (profileid3, index, goodMatches, priority) => {
        let { appid, itemIds } = globalSettings.badgepageFilter;
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

    // remove/disable button

    let HTMLString = '<div class="badge_detail_tasks footer"></div>'
    + '<div id="good-swaps-results" class="enhanced-section">'
    +    '<div class="enhanced-header">Good Matches</div>'
    +    '<div class="enhanced-body"></div>'
    + '</div>'
    + cssAddThrobber();
    document.querySelector('.badge_row_inner').insertAdjacentHTML('beforeend', HTMLString);

    let { friendsCardStock } = globalSettings.badgepageFilter;
    let processedFriends = new Set();
    let goodSwapListElem = document.querySelector('#good-swaps-results > .enhanced-body');

    for(let profileElem of document.querySelectorAll('.badge_friendwithgamecard')) {
        let profileUrl = profileElem.querySelector('.persona').href.match(/(id|profiles)\/[^/]+$/g)[0];
        if(processedFriends.has(profileUrl)) {
            continue;
        }

        await badgepageFilterFetchFriend(profileElem);
        let profile = friendsCardStock[profileUrl];

        if(!profile?.stock) {
            continue;
        } else if(!profile?.possibleCards?.some(x => x.length)) {
            continue;
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

        processedFriends.add(profileUrl);
    }

    document.querySelector('.userscript-throbber').remove();
}

async function badgepageFilterBalanceCardsListener() {
    const generateMatchItemsHTMLString = (matchResult, leftSide = true) => {
        const generateMatchItemHTMLString = (qty, i) => {
            return `<div class="match-item" data-qty="${Math.abs(qty)}" title="${cardInfoList[i].name}"><img src="${cardInfoList[i].img + '/96fx96f?allow_animated=1'}" alt="${cardInfoList[i].name}"></div>`
        };
        let { cardInfoList } = globalSettings.badgepageFilter;
        return matchResult.map((swapAmount, index) =>
            leftSide ? (swapAmount<0 ? generateMatchItemHTMLString(swapAmount, index) : '') : (swapAmount>0 ? generateMatchItemHTMLString(swapAmount, index) : '')
        ).join('');
    };
    const generateMatchRowHTMLString = (matchResult) => {
        return '<div class="match-item-row align-right">'
        + '<div class="match-item-list left">'
        +    generateMatchItemsHTMLString(matchResult, true)
        + '</div>'
        + `<div class="match-item-action trade"></div>`
        + '<div class="match-item-list right">'
        +    generateMatchItemsHTMLString(matchResult, false)
        + '</div>';
    };

    let HTMLString = '<div class="badge_detail_tasks footer"></div>'
    + '<div id="balance-results" class="enhanced-section">'
    +    '<div class="enhanced-header">Balanced Matches</div>'
    +    '<div class="enhanced-body"></div>'
    + '</div>'
    + cssAddThrobber();
    document.querySelector('.badge_row_inner').insertAdjacentHTML('beforeend', HTMLString);

    let { myCardStock, friendsCardStock } = globalSettings.badgepageFilter;
    let processedFriends = new Set();
    let balanceMatchingListElem = document.querySelector('#balance-results > .enhanced-body');

    for(let profileElem of document.querySelectorAll('.badge_friendwithgamecard')) {
        let profileUrl = profileElem.querySelector('.persona').href.match(/(id|profiles)\/[^/]+$/g)[0];
        if(processedFriends.has(profileUrl)) {
            continue;
        }

        await badgepageFilterFetchFriend(profileElem);
        let profile = friendsCardStock[profileUrl];

        if(!profile?.stock) {
            continue;
        }

        let balanceResult = Matcher.balanceVariance(myCardStock, profile.stock);
        if(!balanceResult.swap.some(x => x)) {
            continue;
        }

        let profileBalancedMatchingHTMLString = '<div class="match-container-outer">'
        +    '<div class="match-container">'
        +       '<div class="match-header">'
        +          '<div class="match-name">'
        +             `<a href="${profile.profileLink}" class="avatar ${profile.state ?? 'offline'}">`
        +                `<img src="${profile.pfp}">`
        +             '</a>'
        +             profile.name
        +          '</div>'
        +       '</div>'
        +       generateMatchRowHTMLString(balanceResult.swap)
        +    '</div>'
        + '</div>';
        balanceMatchingListElem.insertAdjacentHTML('beforeend', profileBalancedMatchingHTMLString);

        processedFriends.add(profileUrl);
    }

    document.querySelector('.userscript-throbber').remove();
}
