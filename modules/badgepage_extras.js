const BadgepageExtras = {
    setup: function() {
        let isFoilPage = window.location.search.includes('border=1');
        let badgepageUrl = document.querySelector('.profile_small_header_text').lastElementChild.href;
        let userProfileUrlString = document.getElementById('global_actions').querySelector(':scope > a').href;
        let currentProfileUrlString = document.querySelector('.profile_small_header_texture > a').href;

        let appid = badgepageUrl.match(/\d+(?=\/$)/g)[0];
        if(!appid) {
            throw 'BadgepageForumButton.setup(): appid not found?';
        }

        GM_addStyle(cssBadgepage);



        let badgepageButtonsElem = document.querySelector('.gamecards_inventorylink');
        if(!badgepageButtonsElem) {
            let badgeDetailElem = document.querySelector('.badge_detail_tasks');
            badgeDetailElem.insertAdjacentHTML('afterbegin', '<div class="gamecards_inventorylink"></div>');
            badgepageButtonsElem = badgeDetailElem.querySelector('.gamecards_inventorylink');
        }

        let htmlStringList = [];

        // Add forum button link
        let forumButtonHTMLString = `<a target="_blank" class="btn_grey_grey btn_medium" href="https://steamcommunity.com/app/${appid}/tradingforum">`
          +     '<span>Visit Trade Forum</span>'
          + '</a>';
        htmlStringList.push(forumButtonHTMLString);

        // Add foil/normal badgepage button link
        let badgepageUrlString = badgepageUrl;
        if(!isFoilPage) {
            badgepageUrlString += '?border=1';
        }
        let foilToggleButtonHTMLString = `<a class="btn_grey_grey btn_medium" href="${badgepageUrlString}">`
          +     `<span>${isFoilPage ? 'Normal' : 'Foil'} Badge Page</span>`
          + '</a>';
        htmlStringList.push(foilToggleButtonHTMLString);

        // Add User's badgepage button link
        let isUserPage = userProfileUrlString.includes(currentProfileUrlString);
        if(!isUserPage) {
            let userBadgepageUrlString = badgepageUrl.replace(currentProfileUrlString+'/', userProfileUrlString);
            if(isFoilPage) {
                userBadgepageUrlString += '?border=1';
            }
            let userbadgepageButtonHTMLString = `<a target="_blank" class="btn_grey_grey btn_medium" href="${userBadgepageUrlString}">`
              +     '<span>Open My Badgepage</span>'
              + '</a>';
            htmlStringList.push(userbadgepageButtonHTMLString);
        }

        badgepageButtonsElem.insertAdjacentHTML('afterbegin', htmlStringList.join(' '));



        // Set unowned cards to the proper overlay/border
        // WARNING: Currently causes quick flash of owned cards before getting changed to unowned
        let cardElemSetUnowned = (elem) => {
            elem.classList.remove('owned');
            elem.classList.add('unowned');
            if(!elem.querySelector('.game_card_unowned_border')) {
                elem.firstElementChild.insertAdjacentHTML('afterbegin', '<div class="game_card_unowned_border"></div>');
            }
        };

        for(let cardElem of document.querySelectorAll('.badge_card_set_card')) {
            let cardQtyElem = cardElem.querySelector('.badge_card_set_text_qty');
            if(!cardQtyElem) {
                if(cardElem.classList.contains('owned')) {
                    cardElemSetUnowned(cardElem);
                }
                continue;
            }

            let cardQty = parseInt(cardQtyElem.textContent.replace(/^\(|\)$/g, ''));
            if((!Number.isInteger(cardQty) || cardQty === 0) && cardElem.classList.contains('owned')) {
                cardElemSetUnowned(cardElem);
            }
        }



        // Add badgepage button for every profile entry in missing cards section
        let missingCardsSectionElem = document.querySelector('.badge_cards_to_collect');
        if(missingCardsSectionElem) {
            for(let friendElem of missingCardsSectionElem.querySelectorAll('.badge_friendwithgamecard')) {
                let profileUrlString = friendElem.querySelector('.persona').href;
                let friendBadgepageUrlString = badgepageUrl.replace(currentProfileUrlString, profileUrlString);
                if(isFoilPage) {
                    friendBadgepageUrlString += '?border=1';
                }
                let actionBarElem = friendElem.querySelector('.badge_friendwithgamecard_actions');
                let htmlString = `<a class="btn_grey_grey btn_medium" title="View Their Badgepage" href="${friendBadgepageUrlString}" target="_blank">`
                    +     `<img src="https://community.akamai.steamstatic.com/economy/emoticon/tradingcard${isFoilPage ? 'foil' : ''}">`
                  + '</a>'
                actionBarElem.insertAdjacentHTML('beforeend', htmlString);
            }
        }



        // Optional: delete other trade forum buttons in the friends with cards section
        // WARNING: May or may not break other modules that might use these buttons
    }
};
