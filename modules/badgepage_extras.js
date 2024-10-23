const BadgepageExtras = {
    setup: function() {
        let badgepageUrl = document.querySelector('.profile_small_header_text').lastElementChild.href
        let appid = badgepageUrl.match(/\d+(?=\/$)/g)[0];
        if(!appid) {
            throw 'BadgepageForumButton.setup(): appid not found?';
        }

        // Add forum button link
        let badgepageButtonsElem = document.querySelector('.gamecards_inventorylink');
        if(!badgepageButtonsElem) {
            throw 'BadgepageForumButton.setup(): buttons list not found?';
        }

        let htmlStringList = [];

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

        // Optional: delete other trade forum buttons in the friends with cards section
        // WARNING: May or may not break other modules that might use these buttons
    }
};
