const badgepageCompareShortcuts = {};
const badgepageCompareData = {};

async function setupBadgepageCompare() {
    Object.assign(badgepageCompareData, {
        itemIds: {},
        cardInfoList: [],
        appid: document.querySelector('a.whiteLink:nth-child(5)').href.match(/\d+(?=\/$)/g)[0],
        them: {
            stock: getCardStock(document)
        }
    });

    for(let cardEntry of document.querySelectorAll('.badge_card_set_card')) {
        let textNodes = cardEntry.querySelector('.badge_card_set_text').childNodes;
        badgepageCompareData.cardInfoList.push({
            name: textNodes[textNodes.length-3].textContent.trim(),
            img: cardEntry.querySelector('img').src
        });
    }

 
    GM_addStyle(cssGlobal);
    GM_addStyle(cssEnhanced);
    GM_addStyle(cssMatcher);

    let friendFilterHTMLString = '<div class="badge_detail_tasks footer"></div>'
      + '<div class="enhanced-options right userscript-vars">' 
      +    '<button id="good-swaps" class="userscript-btn purple wide">Display Good Swaps</button>'
      +    '<button id="balance-cards" class="userscript-btn purple wide">Balance Cards</button>'
      +    '<button id="help-others" class="userscript-btn purple wide">Help Friends!</button>'
      + '</div>';
    let headerLinkElem = document.querySelector('.badge_row_inner');
    headerLinkElem.insertAdjacentHTML('beforeend', friendFilterHTMLString);

    badgepageCompareShortcuts.main = document.querySelector('.badge_row_inner');
    badgepageCompareShortcuts.main.insertAdjacentHTML('beforeend', cssAddThrobber());
    badgepageCompareShortcuts.throbber = document.querySelector('.userscript-throbber');

    document.getElementById('good-swaps').addEventListener('click', badgepageCompareShowGoodMatchesListener);
    document.getElementById('balance-cards').addEventListener('click', badgepageCompareMutualOnlyMatchingListener);
    document.getElementById('help-others').addEventListener('click', badgepageCompareHelpOthersListener);
}

async function badgepageCompareGetMyBadgepage() {
    let myHomepage = document.getElementById('global_actions').querySelector(':scope > a').href;
    let appid = document.querySelector('a.whiteLink:nth-child(5)').href.match(/\d+(?=\/$)/g)[0];
    let isFoil = window.location.search.includes('border=1');
    let urlString = `${myHomepage}/gamecards/${appid}/`;
    if(isFoil) {
        urlString += '?border=1';
    }

    let response = await fetch(urlString);

    let parser = new DOMParser();
    let doc = parser.parseFromString(await response.text(), 'text/html');

    let myStock = getCardStock(doc);
    let myMissingCards = new Set();
    let myPossibleCards = new Set();

    if(!myStock.some(x => x)) {
        // User doesn't have cards, disable all other buttons

        badgepageCompareData.me = null;
        return;
    }

    for(let i=0; i<myStock.length; ++i) {
        if(myStock[i]>=2) {
            myPossibleCards.add(i);
        } else if(myStock[i]==0) {
            myMissingCards.add(i);
        }
    }

    for(let missingCardElem of document.querySelectorAll('.badge_card_to_collect')) {
        let itemId = parseInt(missingCardElem.querySelector('img').id.slice(9));
        let index = parseInt(missingCardElem.querySelector('.badge_card_collect_text > :last-child').textContent.match(/\d+/)) - 1;
        badgepageCompareData.itemIds[index] = itemId;
    }


    badgepageCompareData.me = {
        stock: myStock,
        missing: myMissingCards,
        possible: myPossibleCards
    };
} 

async function badgepageCompareShowGoodMatchesListener() {
    function getPossibleMatches(stock, partnerMissingCards, partnerPossibleCards) {
        let minVal = Math.min(...stock);
        let lowestCards = new Set(stock.reduce((arr, x, i) => {
            if(x==minVal) {
                arr.push(i);
            }
            return arr;
        }, []));

        let possibleCards = Array(stock.length);
        for(let i=0; i<possibleCards.length; ++i) {
            possibleCards[i] =[];
        }

        for(let partnerMissingCard of partnerMissingCards) {
            for(let partnerPossibleCard of partnerPossibleCards) {
                if(partnerMissingCard == partnerPossibleCard) {
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
    }
    const generateMatchItemsHTMLString = (indices, priority) => {
        let { cardInfoList } = badgepageCompareData;
        return indices.map(x => `<div class="match-item${priority.has(x) ? ' good' : ''}" title="${cardInfoList[x].name}"><img src="${cardInfoList[x].img + '/96fx96f?allow_animated=1'}" alt="${cardInfoList[x].name}"></div>`).join('');
    };
    const generateMatchRowHTMLString = (profileid3, index, goodMatches, priority) => {
        let { appid, itemIds } = badgepageCompareData;
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

    document.getElementById('good-swaps').setAttribute('disabled', '');
    badgepageCompareShortcuts.main.classList.add('loading');

    let HTMLString = '<div class="badge_detail_tasks footer"></div>'
      + '<div id="good-swaps-results" class="enhanced-section">'
      +    '<div class="enhanced-header">Good Matches</div>'
      +    '<div class="enhanced-body"></div>'
      + '</div>';
    badgepageCompareShortcuts.throbber.insertAdjacentHTML('beforebegin', HTMLString);
    let goodSwapListElem = document.querySelector('#good-swaps-results > .enhanced-body');

    if(badgepageCompareData.me === undefined) {
        await badgepageCompareGetMyBadgepage();
    }
    if(badgepageCompareData.me === null) {
        console.log('badgepageCompareShowGoodMatchesListener(): User doesnt have anything to match!');

        badgepageCompareShortcuts.main.classList.remove('loading');
        return;
    }

    let { me, them } = badgepageCompareData;
    let { lowestCards, possibleCards } = await getPossibleMatches(them.stock, me.missing, me.possible);
    if( !possibleCards?.some(x => x.length) ) {
        badgepageCompareShortcuts.main.classList.remove('loading');
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
      +       generateMatchRowsHTMLString(profile.id3, possibleCards, lowestCards)
      +    '</div>'
      + '</div>';
    goodSwapListElem.insertAdjacentHTML('beforeend', profileGoodSwapHTMLString);

    badgepageCompareShortcuts.main.classList.remove('loading');
}

function badgepageCompareMutualOnlyMatchingListener() {
    badgepageCompareBalanceCards('balance-match', 'Balance Cards', false);
}

function badgepageCompareHelpOthersListener() {
    badgepageCompareBalanceCards('helper-match', 'Helping Friends', true);
}

async function badgepageCompareBalanceCards(elemId, headerTitle, helperMode) {
    if(helperMode) {
        document.getElementById('help-others').setAttribute('disabled', '');
    } else {
        document.getElementById('balance-cards').setAttribute('disabled', '');
    }
    badgepageCompareShortcuts.main.classList.add('loading');

    let HTMLString = '<div class="badge_detail_tasks footer"></div>'
      + `<div id="${elemId}" class="enhanced-section">`
      +    `<div class="enhanced-header">${headerTitle}</div>`
      +    '<div class="enhanced-body"></div>'
      + '</div>';
    badgepageCompareShortcuts.throbber.insertAdjacentHTML('beforebegin', HTMLString);
    let balanceMatchingListElem = document.querySelector(`#${elemId} > .enhanced-body`);

    if(badgepageCompareData.me === undefined) {
        await badgepageCompareGetMyBadgepage();
    }
    if(badgepageCompareData.me === null) {
        console.log('badgepageCompareBalanceCards(): User doesnt have anything to match!');

        badgepageCompareShortcuts.main.classList.remove('loading');
        return;
    }

    let { me, them } = badgepageCompareData;
    let balanceResult = Matcher.balanceVariance(me.stock, them.stock, false, (helperMode ? 1 : -1) );
    if(!balanceResult.swap.some(x => x)) {
        badgepageCompareShortcuts.main.classList.remove('loading');
        return;
    }

    let balancedMatchingHTMLString = badgepageGenerateMatchResultHTML(/* profile */{}, balanceResult);
    balanceMatchingListElem.insertAdjacentHTML('beforeend', balancedMatchingHTMLString);

    badgepageCompareShortcuts.main.classList.remove('loading');
}

