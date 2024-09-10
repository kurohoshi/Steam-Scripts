const BadgepageFilter = {
    SETTINGSDEFAULTS: {
        applist: {
            // object of appids, array/set of profileids
        },
        includeCacheMatching: false
    },

    shortcuts: {},
    data: {},

    setup: async function() {
        Object.assign(BadgepageFilter.data, {
            isMyPage: document.getElementById('global_actions').querySelector(':scope > a').href.includes(document.querySelector('.profile_small_header_texture > a').href),
            itemIds: {},
            cardInfoList: [],
            appid: document.querySelector('a.whiteLink:nth-child(5)').href.match(/\d+(?=\/$)/g)[0],
            isFoilPage: window.location.search.includes('border=1'),
            friendsCardStock: {},
            // cachedProfiles: added from globalSettings
            // me: added from processing my badgepage
        });

        let { isMyPage, cardInfoList } = BadgepageFilter.data;

        let config = await SteamToolsDbManager.getToolConfig('badgepageFilter');

        globalSettings.badgepageFilter = config.badgepageFilter ?? steamToolsUtils.deepClone(BadgepageFilter.SETTINGSDEFAULTS);
        globalSettings.badgepageFilter.applist[BadgepageFilter.data.appid] ??= [];
        BadgepageFilter.data.cachedProfiles = steamToolsUtils.deepClone(globalSettings.badgepageFilter.applist[BadgepageFilter.data.appid]);

        if(isMyPage) {
            await BadgepageFilter.processMyPage();
        } else {
            await BadgepageFilter.processOthersPage(document);
        }

        for(let cardEntry of document.querySelectorAll('.badge_card_set_card')) {
            let textNodes = cardEntry.querySelector('.badge_card_set_text').childNodes;
            cardInfoList.push({
                name: textNodes[textNodes.length-3].textContent.trim(),
                img: cardEntry.querySelector('img').src
            });
        }

        addSvgBlock(document.getElementById('responsive_page_template_content'));
        GM_addStyle(cssGlobal);
        GM_addStyle(cssEnhanced);
        GM_addStyle(cssMatcher);

        let friendMatchHTMLString = '<div id="page-match-options" class="enhanced-options right userscript-vars">'
          +     '<button id="good-swaps" class="userscript-btn purple wide">Display Good Swaps</button>'
          +     '<button id="balance-cards" class="userscript-btn purple wide">Balance Cards</button>'
          +     '<button id="help-others" class="userscript-btn purple wide">Help Friends!</button>'
          + '</div>';
        if(isMyPage) {
            let headerLinkElem = document.querySelector('.badge_cards_to_collect');
            headerLinkElem.insertAdjacentHTML('beforebegin', friendMatchHTMLString);
        } else {
            let headerLinkElem = document.querySelector('.badge_row_inner');
            headerLinkElem.insertAdjacentHTML('beforeend', friendMatchHTMLString);
        }

        BadgepageFilter.shortcuts.main = document.querySelector('.badge_row_inner');
        BadgepageFilter.shortcuts.options = document.getElementById('page-match-options');
        BadgepageFilter.shortcuts.main.insertAdjacentHTML('beforeend', cssAddThrobber());
        BadgepageFilter.shortcuts.throbber = document.querySelector('.userscript-throbber');

        document.getElementById('good-swaps').addEventListener('click', BadgepageFilter.showGoodSwapsListener);
        document.getElementById('balance-cards').addEventListener('click', BadgepageFilter.mutualOnlyMatchingListener);
        document.getElementById('help-others').addEventListener('click', BadgepageFilter.helpOthersListener);

        if(isMyPage) {
            let moreFilterOptionsHTMLString = '<div>'
              +       `<input type="checkbox" id="include-cached-profiles" ${globalSettings.badgepageFilter.includeCacheMatching ? 'checked' : ''}>`
              +       '<label for="include-cached-profiles">Include Past Matches</label>'
              +    '</div>'
              +    '<button id="friend-filter" class="userscript-btn purple wide">Filter Friends</button>';
            BadgepageFilter.shortcuts.options.insertAdjacentHTML('afterbegin', moreFilterOptionsHTMLString);
            document.getElementById('include-cached-profiles').addEventListener('click', BadgepageFilter.updateCacheFlagListener);
            document.getElementById('friend-filter').addEventListener('click', BadgepageFilter.filterFriendsWithCardsListener);
        } else {
            let dividerHTMLString = '<div class="badge_detail_tasks footer"></div>';
            BadgepageFilter.shortcuts.options.insertAdjacentHTML('beforebegin', dividerHTMLString);
        }
    },
    getCardStock: function(pageElem) {
        if(!pageElem.querySelector('.badge_card_set_cards')) {
            return null;
        }

        let cardStock = [];
        for(let cardEntry of pageElem.querySelectorAll('.badge_card_set_card')) {
            let cardEntryNodes = cardEntry.children[1].childNodes;
            let cardAmount = cardEntryNodes.length === 5 ? parseInt(cardEntryNodes[1].textContent.replace(/[()]/g, '')) : 0;
            cardStock.push(parseInt(cardAmount));
        }

        return cardStock;
    },
    processMyPage: async function() {
        if(BadgepageFilter.data.me) {
            return;
        }

        let { isMyPage, itemIds } = BadgepageFilter.data;

        let doc;
        if(isMyPage) {
            doc = document;
        } else {
            let myHomepage = document.getElementById('global_actions').querySelector(':scope > a').href;
            let { appid, isFoilPage } = BadgepageFilter.data;
            let urlString = `${myHomepage}/gamecards/${appid}/${isFoilPage ? '?border=1' : ''}`;

            let response = await fetch(urlString);
            let parser = new DOMParser();
            doc = parser.parseFromString(await response.text(), 'text/html');
        }

        let stock = BadgepageFilter.getCardStock(doc);
        let missing = new Set();
        let possible = new Set();

        if(!stock.some(x => x)) {
            if(BadgepageFilter.shortcuts.options) {
                for(let button of BadgepageFilter.shortcuts.options.querySelectorAll('button')) {
                    button.setAttribute('disabled', '');
                }
            }

            BadgepageFilter.data.me = null;
            return;
        }

        for(let i=0; i<stock.length; ++i) {
            if(stock[i]>=2) {
                possible.add(i);
            } else if(stock[i]==0) {
                missing.add(i);
            }
        }

        for(let missingCardElem of doc.querySelectorAll('.badge_card_to_collect')) {
            let itemId = parseInt(missingCardElem.querySelector('img').id.slice(9));
            let index = parseInt(missingCardElem.querySelector('.badge_card_collect_text > :last-child').textContent.match(/\d+/)) - 1;
            itemIds[index] = itemId;
        }

        BadgepageFilter.data.me = { stock, missing, possible };
    },
    getFriendPage: async function(target) {
        let { friendsCardStock, isFoilPage, appid } = BadgepageFilter.data;
        let isString = typeof target === 'string';
        let profileUrl = isString
          ? target
          : target.querySelector('.persona').href.match(/(id|profiles)\/[^/]+$/g)[0];

        if(!Object.hasOwn(friendsCardStock, profileUrl)) {
            let steamId3 = isString ? undefined : target?.querySelector('.btn_grey_grey ').onclick.toString().match(/\d+/g)[0];
            let urlString = `https://steamcommunity.com/${profileUrl}/gamecards/${appid}/${isFoilPage ? '?border=1' : ''}`;

            let response = await fetch(urlString);
            let parser = new DOMParser();
            let doc = parser.parseFromString(await response.text(), "text/html");

            friendsCardStock[profileUrl] = {
                id3: steamId3
            };

            await BadgepageFilter.processOthersPage(doc, profileUrl);
        }

        return friendsCardStock[profileUrl];
    },
    processOthersPage: async function(doc, targetUrl) {
        let { friendsCardStock } = BadgepageFilter.data;

        if(!doc.querySelector('.badge_gamecard_page')) {
            if(targetUrl) {
                friendsCardStock[targetUrl] = null;
                await BadgepageFilter.profileCacheRemove(targetUrl);
            }
            return;
        }

        let badgepageHeaderElem = doc.querySelector('.profile_small_header_texture');
        let profileLink = badgepageHeaderElem.querySelector('.profile_small_header_name > a').href;
        let profileUrl = profileLink.replace('https://steamcommunity.com/', '');
        let name = badgepageHeaderElem.querySelector('.profile_small_header_name').textContent.trim();
        let avatarElem = badgepageHeaderElem.querySelector('.playerAvatar');
        let state = avatarElem.classList.contains('offline')
          ? 'offline' : avatarElem.classList.contains('online')
          ? 'online' : avatarElem.classList.contains('in-game')
          ? 'in-game' : null;
        let imgLink = avatarElem.children[avatarElem.children.length-1].src.replace('_medium', '');

        let stock = BadgepageFilter.getCardStock(doc);

        if(!stock?.some(x => x)) {
            await BadgepageFilter.profileCacheRemove(profileUrl);
            friendsCardStock[profileUrl] = null;
        } else {
            await BadgepageFilter.profileCacheAdd(profileUrl);

            friendsCardStock[profileUrl] ??= {};
            Object.assign(friendsCardStock[profileUrl], {
                name,
                profileLink,
                pfp: imgLink,
                state,
                stock
            });
        }

        return friendsCardStock[profileUrl];
    },
    updateCacheFlagListener: async function(event) {
        globalSettings.badgepageFilter.includeCacheMatching = event.target.checked;
        await BadgepageFilter.saveConfig();
    },
    getPossibleMatches: function(profile, partnerMissingCards, partnerPossibleCards) {
        let { stock, lowestCards: profileLowestCards, possibleCards: profilePossibleCards } = profile;

        if(profileLowestCards && profilePossibleCards) {
            return { profileLowestCards, profilePossibleCards };
        }

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
                if(partnerMissingCard === partnerPossibleCard) {
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

        profile.lowestCards = lowestCards;
        profile.possibleCards = possibleCards;

        return { lowestCards, possibleCards };
    },
    // provides only mutually beneficial matches with any duplicates cards being fair game
    filterFriendsWithCardsListener: async function() {
        document.getElementById('friend-filter').setAttribute('disabled', '');

        let { friendsCardStock, isMyPage, me } = BadgepageFilter.data;

        if(!isMyPage) {
            console.error('badgepageFilterFilterFriendsWithCardsListener(): This is not a user badgepage, it should not have been called!');
            return;
        }

        for(let missingCardElem of document.querySelectorAll('.badge_card_to_collect')) {
            let index = missingCardElem.querySelector('.badge_card_collect_text').lastElementChild.textContent.match(/^\d+/g)[0];
            index = parseInt(index)-1;

            for(let profileContainerElem of missingCardElem.querySelectorAll('.badge_friendwithgamecard')) {
                let profileElem = profileContainerElem.querySelector('.persona');
                let profileUrl = profileElem.href.match(/(id|profiles)\/[^/]+$/g);

                await BadgepageFilter.getFriendPage(profileContainerElem);

                if(!friendsCardStock[profileUrl]?.stock) {
                    profileContainerElem.style.backgroundColor = '#111';
                    return;
                }

                BadgepageFilter.getPossibleMatches(friendsCardStock[profileUrl], me.missing, me.possible);

                if(!friendsCardStock[profileUrl]?.possibleCards?.[index].length) {
                    profileContainerElem.style.display = 'none';
                }
            }
        }
    },
    // provides only mutually beneficial matches with any duplicates cards being fair game
    showGoodSwapsListener: async function() {
        const generateMatchItemsHTMLString = function(indices, priority) {
            let { cardInfoList } = BadgepageFilter.data;
            return indices.map(x => `<div class="match-item${priority.has(x) ? ' good' : ''}" title="${cardInfoList[x].name}"><img src="${cardInfoList[x].img + '/96fx96f?allow_animated=1'}" alt="${cardInfoList[x].name}"></div>`).join('');
        };
        const generateMatchRowHTMLString = function(profileid3, index, goodMatches, priority) {
            let { appid, itemIds } = BadgepageFilter.data;
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
        const checkAndDisplayPossibleSingleSwaps = async function(target) {
            let steamId3;
            let profileUrl;
            if(typeof target === 'object') {
                steamId3 = BadgepageFilter.extractSteamId3(target);
                profileUrl = target.querySelector('.persona').href.match(/(id|profiles)\/[^/]+$/g)[0];
            } else if(typeof target === 'string') {
                profileUrl = target;
            } else {
                // improper parameter type
                return;
            }

            if(processedFriends.has(profileUrl)) {
                return;
            }

            let profile = await BadgepageFilter.getFriendPage(target);

            if(!profile?.stock) {
                return;
            }

            let { lowestCards, possibleCards } = BadgepageFilter.getPossibleMatches(profile, myMissingCards, myPossibleCards);
            if(!possibleCards?.some(x => x.length)) {
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
              +       generateMatchRowsHTMLString(steamId3, possibleCards, lowestCards)
              +    '</div>'
              + '</div>';
            goodSwapListElem.insertAdjacentHTML('beforeend', profileGoodSwapHTMLString);

            processedFriends.add(profileUrl);
        };

        document.getElementById('good-swaps').setAttribute('disabled', '');
        BadgepageFilter.shortcuts.main.classList.add('loading');

        let goodSwapListElem = BadgepageFilter.addGroup('good-swaps', 'Good Matches');

        let processedFriends = new Set();
        await BadgepageFilter.processMyPage();

        if(!BadgepageFilter.data.me) {
            console.error('badgepageFilterShowGoodSwapsListener(): My badgepage data not available!');
            return;
        }

        let myMissingCards = BadgepageFilter.data.me.missing;
        let myPossibleCards = BadgepageFilter.data.me.possible;

        if(BadgepageFilter.data.isMyPage) {
            for(let profileElem of document.querySelectorAll('.badge_friendwithgamecard')) {
                 await checkAndDisplayPossibleSingleSwaps(profileElem);
            }

            if(globalSettings.includeCacheMatching) {
                for(let profile of BadgepageFilter.data.cachedProfiles) {
                    if(profile.url) {
                        await checkAndDisplayPossibleSingleSwaps('id/'+profile.url);
                    } else {
                        await checkAndDisplayPossibleSingleSwaps('profiles/'+profile.id);
                    }
                }
            }
        } else {
            for(let profileUrl in BadgepageFilter.data.friendsCardStock) {
                await checkAndDisplayPossibleSingleSwaps(profileUrl);
            }
        }

        BadgepageFilter.shortcuts.main.classList.remove('loading');
    },
    mutualOnlyMatchingListener: function() {
        BadgepageFilter.balanceCards('balance-match', 'Balance Cards', false);
    },
    helpOthersListener: function() {
        BadgepageFilter.balanceCards('helper-match', 'Helping Friends', true);
    },
    balanceCards: async function(elemId, headerTitle, helperMode) {
        const checkAndDisplayPossibleMatches = async function(target) {
            let profileUrl;
            if(typeof target === 'object') {
                profileUrl = target.querySelector('.persona').href.match(/(id|profiles)\/[^/]+$/g)[0];
            } else if(typeof target === 'string') {
                profileUrl = target;
            } else {
                // improper parameter type
                return;
            }

            if(processedFriends.has(profileUrl)) {
                return;
            }

            let profile = await BadgepageFilter.getFriendPage(target);

            if(!profile?.stock) {
                return;
            }

            let balanceResult = Matcher.balanceVariance(myStock, profile.stock, false, (helperMode ? 1 : -1) );
            if(!balanceResult.swap.some(x => x)) {
                return;
            }

            let profileBalancedMatchingHTMLString = BadgepageFilter.generateMatchResultHTML(profile, balanceResult);
            balanceMatchingListElem.insertAdjacentHTML('beforeend', profileBalancedMatchingHTMLString);

            processedFriends.add(profileUrl);
        };

        if(helperMode) {
            document.getElementById('help-others').setAttribute('disabled', '');
        } else {
            document.getElementById('balance-cards').setAttribute('disabled', '');
        }
        BadgepageFilter.shortcuts.main.classList.add('loading');

        let balanceMatchingListElem = BadgepageFilter.addGroup(elemId, headerTitle);

        let processedFriends = new Set();
        await BadgepageFilter.processMyPage();

        if(!BadgepageFilter.data.me) {
            console.error('badgepageFilterShowGoodSwapsListener(): My badgepage data not available!');
            return;
        }

        let myStock = BadgepageFilter.data.me.stock;

        if(BadgepageFilter.data.isMyPage) {
            for(let profileElem of document.querySelectorAll('.badge_friendwithgamecard')) {
                let profileUrl = profileElem.querySelector('.persona').href.match(/(id|profiles)\/[^/]+$/g)[0];
                await checkAndDisplayPossibleMatches(profileUrl);
            }

            if(globalSettings.includeCacheMatching) {
                for(let profile of BadgepageFilter.data.cachedProfiles) {
                    if(profile.url) {
                        await checkAndDisplayPossibleMatches('id/'+profile.url);
                    } else {
                        await checkAndDisplayPossibleMatches('profiles/'+profile.id);
                    }
                }
            }
        } else {
            for(let profileUrl in BadgepageFilter.data.friendsCardStock) {
                await checkAndDisplayPossibleMatches(profileUrl);
            }
        }

        BadgepageFilter.shortcuts.main.classList.remove('loading');
    },
    generateMatchResultHTML: function(profileData, balanceResult) {
        let { cardInfoList } = BadgepageFilter.data;

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
    },
    extractSteamId3: function(elem) {
        return elem?.querySelector('.btn_grey_grey ').onclick.toString().match(/\d+/g)?.[0];
    },
    addGroup: function(id, title) {
        let HTMLString = '<div class="badge_detail_tasks footer"></div>'
          + `<div id="${id}-results" class="enhanced-section">`
          +    `<div class="enhanced-header">${title}</div>`
          +    '<div class="enhanced-body"></div>'
          + '</div>';
        BadgepageFilter.shortcuts.throbber.insertAdjacentHTML('beforebegin', HTMLString);

        return document.querySelector(`#${id}-results > .enhanced-body`);
    },
    profileCacheAdd: async function(profileUrl) {
        let { appid } = BadgepageFilter.data;
        let profileInstance = Profile.findProfile(profileUrl.replace(/(id|profiles)\/+/g, ''));
        if(profileInstance) {
            globalSettings.badgepageFilter.applist[appid].push({
                id: profileInstance.id,
                url: profileInstance.url,
                token: profileInstance.tradeToken
            });
            await BadgepageFilter.saveConfig();
        } else {
            console.warn(`badgepageFilterProfileCacheAdd(): Failed to find profile ${profileUrl}!`);
        }
    },
    profileCacheRemove: async function(profileUrl) {
        let { appid } = BadgepageFilter.data;
        let cachedProfiles = globalSettings.badgepageFilter.applist[appid];
        cachedProfiles.splice(cachedProfiles.indexOf(profileUrl), 1);
        await BadgepageFilter.saveConfig();
    },
    saveConfig: async function() {
        await SteamToolsDbManager.setToolConfig('badgepageFilter');
    },
    loadConfig: async function() {
        let config = await SteamToolsDbManager.getToolConfig('badgepageFilter');
        if(config.badgepageFilter) {
            globalSettings.badgepageFilter = config.badgepageFilter;
        }
    }
};
