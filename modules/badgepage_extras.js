const BadgepageExtras = {
    setup: function() {
        let badgepageUrl = document.querySelector('.profile_small_header_text').lastElementChild.href
        let appid = badgepageUrl.match(/\d+(?=\/$)/g)[0];
        if(!appid) {
            throw 'BadgepageForumButton.setup(): appid not found?';
        }



        let badgepageButtonsElem = document.querySelector('.gamecards_inventorylink');
        if(!badgepageButtonsElem) {
            console.warn('BadgepageForumButton.setup(): buttons list not found?');
        } else {
            let htmlStringList = [];

            // Add forum button link
            let forumButtonHTMLString = `<a target="_blank" class="btn_grey_grey btn_medium" href="https://steamcommunity.com/app/${appid}/tradingforum">`
              +     '<span>Visit Trade Forum</span>'
              + '</a>';
            htmlStringList.push(forumButtonHTMLString);

            // Add foil/normal badgepage button link
            let isFoilPage = window.location.search.includes('border=1');
            let badgepageUrlString = badgepageUrl;
            if(!isFoilPage) {
                badgepageUrlString += '?border=1';
            }
            let foilToggleButtonHTMLString = `<a class="btn_grey_grey btn_medium" href="${badgepageUrlString}">`
              +     `<span>${isFoilPage ? 'Normal' : 'Foil'} Badge Page</span>`
              + '</a>';
            htmlStringList.push(foilToggleButtonHTMLString);

            badgepageButtonsElem.insertAdjacentHTML('afterbegin', htmlStringList.join(' '));
        }



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

        // Optional: delete other trade forum buttons in the friends with cards section
        // WARNING: May or may not break other modules that might use these buttons
    }
};
