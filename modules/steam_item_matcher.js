GLOBALSETTINGSDEFAULTS.matcher = {
    config: {
        matchGroup: {
            label: 'Match With',
            id: 'matchgroup',
            options: [
                { name: 'friends', id: 'match-friends', label: 'Friends', value: true },
                { name: 'asfAny', id: 'match-asf-bots-any', label: 'ASF Any Bots', value: true },
                { name: 'asfFair', id: 'match-asf-bots-fair', label: 'ASF Fair Bots', value: false },
                { name: 'custom', id: 'match-user-list', label: 'My List', value: true }
            ]
        },
        ignoreGroup: {
            label: 'Ignore Profiles On',
            id: 'ignoregroup',
            options: [{ name: 'blacklist', id: 'match-ignore-blacklist', label: 'Blacklist', value: true }]
        },
        matchItemType: {
            label: 'Match Item Types',
            id: 'itemgroup',
            options: [
                // { name: 'gem', id: 'match-gems', label: 'Gems', value: false },
                // { name: 'booster', id: 'match-booster', label: 'Booster Packs', value: false },
                { name: 'card', id: 'match-card', label: 'Trading Cards', value: true },
                { name: 'background', id: 'match-background', label: 'Backgrounds', value: true },
                { name: 'emoticon', id: 'match-emoticon', label: 'Emoticons', value: true },
                // { name: 'saleItem', id: 'match-sale-item', label: 'Sale Items', value: false }
            ]
        },
        matchApp: {
            label: 'Match Apps On',
            id: 'appgroup',
            options: [
                // { name: 'badgepage', id: 'match-badgepage', label: 'My Badge Page', value: false },
                { name: 'custom', id: 'match-user-app-list', label: 'My App List', value: false }
            ]
        }
    },
    lists: {
        matchlist: { label: 'Matchlist', data: [] },
        blacklist: { label: 'Blacklist', data: [] },
        applist: { label: 'Apps', data: [] }
    },
    currentTab: 'matchlist'
};
const MatcherConfigShortcuts = {};

async function gotoMatcherConfigPage() {
    const generateConfigHeaderString = (title) => `<div class="userscript-config-header"><span>${title}</span></div>`;
    const generateConfigButtonString = (id, label) => `<div class="userscript-config-option"><input type="checkbox" class="button" id="${id}"><label for="${id}">${label}</label></div>`;
    const generateConfigButtonsString = (checkList) => checkList.map(x => generateConfigButtonString(x.id, x.label)).join('');
    const generateConfigButtonGroupString = () => Object.values(globalSettings.matcher.config).map(x => {
        return `<div class="userscript-config-group" data-id="${x.id}">${generateConfigHeaderString(x.label)}${generateConfigButtonsString(x.options)}</div>`
    }).join('');
    const generateConfigListTabs = (list) => {
        let HTMLString = '';
        for(let listGroup in list) {
            HTMLString += `<div class="userscript-config-list-tab" data-list-name="${listGroup}">${list[listGroup].label}</div>`;
        }
        return HTMLString;
    };
    const generateConfigListGroups = (list) => {
        let HTMLString = '';
        for(let listGroup in list) {
            HTMLString += `<div class="userscript-config-list-entry-group" data-list-name="${listGroup}"></div>`;
        }
        return HTMLString;
    }

    console.log('Setting up Matcher Configuration!');

    MatcherConfigShortcuts.MAIN_ELEM = document.querySelector('#responsive_page_template_content');

    if(!MatcherConfigShortcuts.MAIN_ELEM) {
        alert('Main element no found, Matcher Configuration will not be set up');
        console.warn('gotoMatcherConfigPage(): Main element no found, Matcher Configuration will not be set up!');
        return;
    }

    // set up css styles for this feature
    GM_addStyle(cssGlobal);

    MatcherConfigShortcuts.MAIN_ELEM.innerHTML = '';
    document.body.classList.remove('profile_page'); // profile page causes bg color to be black

    let config = await SteamToolsDbManager.getToolConfig('matcher');
    if(config.matcher) {
        globalSettings.matcher = config.matcher;
    } else {
        globalSettings.matcher = steamToolsUtils.deepClone(GLOBALSETTINGSDEFAULTS.matcher);
    }

    addSvgBlock(MatcherConfigShortcuts.MAIN_ELEM);

    let matcherConfigHTMLString = '<div class="userscript-config userscript-vars">'
      +    '<div class="userscript-config-title"><span>Matcher Configuration</span></div>'
      +    '<div class="userscript-options">'
      +       generateConfigButtonGroupString()
      +       '<div class="userscript-config-group">'
      +          '<div class="userscript-config-header">'
      +             '<span>Configuration Settings</span>'
      +          '</div>'
      +          '<div class="userscript-config-btn-group">'
      +             '<button id="userscript-config-import" class="userscript-btn blue">Import</button>'
      +             '<button id="userscript-config-export" class="userscript-btn blue">Export</button>'
      +          '</div>'
      +          '<div class="userscript-config-btn-group right">'
      +             '<button id="userscript-config-reset" class="userscript-btn blue">Reload</button>'
      +             '<button id="userscript-config-save" class="userscript-btn green">Save</button>'
      +          '</div>'
      +       '</div>'
      +       '<div class="userscript-config-actions">'
      +          '<div class="userscript-config-action">'
      +             '<button id="userscript-config-match-full" class="userscript-btn purple max">Full Match</button>'
      +          '</div>'
      +          '<div class="h-break">OR</div>'
      +          '<div class="userscript-config-action">'
      +             '<input type="text" name="match-profileid" id="match-single-profile-profileid" placeholder="profileid/customUrlId">'
      +             '<button id="userscript-config-match-one" class="userscript-btn purple">Match</button>'
      +          '</div>'
      +       '</div>'
      +    '</div>'
      +    '<div class="userscript-config-list">'
      +       '<div class="userscript-config-list-header tabs">'
      +          generateConfigListTabs(globalSettings.matcher.lists)
      +       '</div>'
      +       '<div class="conf-list-entry-action add">'
      +          '<div class="conf-list-entry-action-add">'
      +             '<div id="entry-action-add" class="entry-action add"></div>'
      +          '</div>'
      +          '<div class="conf-list-entry-action-modify">'
      +             '<div id="entry-action-del" class="userscript-bg-filtered delete"></div>'
      +             '<div id="entry-action-edit" class="userscript-bg-filtered edit"></div>'
      +          '</div>'
      +          '<div class="userscript-overlay"></div>'
      +       '</div>'
      +       '<div class="userscript-config-list-list">'
      +          '<div class="dialog-form-container">'
      +             '<div class="dialog-form"></div>'
      +          '</div>'
      +          '<div class="userscript-overlay">'
      +             '<div class="animated-bar-loader top"></div>'
      +             '<div class="userscript-dialog">'
      +                '<div class="userscript-dialog-container">'
      +                   'Entry already exists, overwrite?'
      +                '</div>'
      +                '<div id="conf-list-entry-old" class="userscript-config-list-entry"></div>'
      +                '<div class="userscript-dialog-container">'
      +                   '<div class="dbl-arrows down"></div>'
      +                '</div>'
      +                '<div id="conf-list-entry-new" class="userscript-config-list-entry"></div>'
      +                '<div class="userscript-dialog-container">'
      +                   '<button id="userscript-dialog-cancel" class="userscript-btn red wide">No</button>'
      +                   '<button id="userscript-dialog-confirm" class="userscript-btn green wide">Yes</button>'
      +                '</div>'
      +             '</div>'
      +             '<div class="userscript-dialog-form">'
      +                '<input type="text" id="entry-form-id" class="userscript-input" placeholder="profileid/customUrlid">'
      +                '<textarea name="" id="entry-form-descript" class="userscript-input" placeholder="Note (Optional)" rows="5"></textarea>'
      +                '<div class="userscript-dialog-container">'
      +                   '<button id="dialog-form-cancel" class="userscript-btn red">Cancel</button>'
      +                   '<button id="dialog-form-add" class="userscript-btn green">Add</button>'
      +                '</div>'
      +             '</div>'
      +          '</div>'
      +          '<div class="userscript-config-list-entries userscript-custom-scroll">'
      +             generateConfigListGroups(globalSettings.matcher.lists)
      +          '</div>'
      +       '</div>'
      +    '</div>'
      +    cssAddOverlay(cssAddThrobber(), {initialState: 'loading'})
      + '</div>';

    MatcherConfigShortcuts.MAIN_ELEM.insertAdjacentHTML("beforeend", matcherConfigHTMLString);

    // element shortcuts
    MatcherConfigShortcuts.configMenu = MatcherConfigShortcuts.MAIN_ELEM.querySelector('.userscript-config');
    MatcherConfigShortcuts.listActionBarElem = MatcherConfigShortcuts.MAIN_ELEM.querySelector('.conf-list-entry-action');
    MatcherConfigShortcuts.listFormContainerElem = MatcherConfigShortcuts.MAIN_ELEM.querySelector('.conf-list-entry-form-container');
    MatcherConfigShortcuts.listOverlayElem = MatcherConfigShortcuts.MAIN_ELEM.querySelector('.conf-list-overlay');
    MatcherConfigShortcuts.listDialogElem = MatcherConfigShortcuts.MAIN_ELEM.querySelector('.conf-list-dialog');
    MatcherConfigShortcuts.listElems = {};
    for(let entryGroup in globalSettings.matcher.lists) {
        MatcherConfigShortcuts.listElems[entryGroup] = MatcherConfigShortcuts.MAIN_ELEM.querySelector(`.userscript-config-list-entry-group[data-list-name=${entryGroup}]`);
    }

    for(let buttonGroup of MatcherConfigShortcuts.MAIN_ELEM.querySelectorAll('.userscript-config-group')) {
        buttonGroup.addEventListener('change', matcherConfigUpdateChecklistListener);
    }
    document.getElementById('userscript-config-import').addEventListener('click', matcherConfigImportListener);
    document.getElementById('userscript-config-export').addEventListener('click', matcherConfigExportListener);
    document.getElementById('userscript-config-reset').addEventListener('click', matcherConfigLoadListener);
    document.getElementById('userscript-config-save').addEventListener('click', matcherConfigSaveListener);
    MatcherConfigShortcuts.MAIN_ELEM.querySelector('.userscript-config-list-header').addEventListener('click', matcherConfigSelectListTabListener);
    document.getElementById('entry-action-add').addEventListener('click', matcherConfigAddListEntryListener);
    document.getElementById('entry-action-edit').addEventListener('click', matcherConfigEditListEntryListener);
    document.getElementById('entry-action-del').addEventListener('click', matcherConfigDeleteListEntryListener);
    MatcherConfigShortcuts.MAIN_ELEM.querySelector('.userscript-config-list-entries').addEventListener('click', matcherConfigSelectListEntryListener);
    document.getElementById('userscript-dialog-cancel').addEventListener('click', matcherConfigListDialogCancelListener);
    document.getElementById('userscript-dialog-confirm').addEventListener('click', matcherConfigListDialogConfirmListener);
    document.getElementById('userscript-config-match-full').addEventListener('click', matcherConfigFullMatchListener);
    document.getElementById('userscript-config-match-one').addEventListener('click', matcherConfigSingleMatchListener);

    MatcherConfigShortcuts.matchSingleProfileProfileid = document.getElementById('match-single-profile-profileid');

    matcherConfigLoadUI();
}

async function matcherConfigLoadUI() {
    MatcherConfigShortcuts.listOverlayElem.classList.add('active');

    const configMenuElem = MatcherConfigShortcuts.MAIN_ELEM.querySelector('.userscript-config');
    if(!configMenuElem) {
        console.warn('updateMatcherConfigUI(): Config menu not found, UI will not be updated');
        return;
    }

    for(let optionGroup of Object.values(globalSettings.matcher.config)) {
        for(let option of optionGroup.options) {
            document.getElementById(option.id).checked = option.value;
        }
    }

    // generate lists
    for(let [listName, listGroup] of Object.entries(globalSettings.matcher.lists)) {
        let entryGroupElem = MatcherConfigShortcuts.listElems[listName];
        let entriesHTMLString = [];
        for(let data of listGroup.data) {
            if(listName==='matchlist' || listName==='blacklist') {
                let profile = await Profile.findProfile(data.profileid);
                if(!profile) {
                    console.warn('matcherConfigLoadUI(): No profile found, skipping this entry...');
                }

                let tradeTokenWarning = listName === 'blacklist' || Profile.me?.isFriend(profile) || profile.tradeToken;
                let entryHTMLString = `<div class="userscript-config-list-entry${tradeTokenWarning ? '' : ' warn'}" data-profileid="${profile.id}" ${profile.url ? `data-url="${profile.url}"` : ''} data-name="${profile.name}">`
                  +    `<a href="https://steamcommunity.com/${profile.url ? `id/${profile.url}` : `profiles/${profile.id}`}/" target="_blank" rel="noopener noreferrer" class="avatar offline">`
                  +       `<img src="https://avatars.akamai.steamstatic.com/${profile.pfp}.jpg" alt="">`
                  +    '</a>'
                  +    `<div class="conf-list-entry-name" title="${profile.name}" >${profile.name}</div>`
                  +    `<div class="conf-list-entry-descript">${data.descript}</div>`
                  + '</div>';

                entriesHTMLString.push({ key1: profile.id, key2: null, string: entryHTMLString });
            } else if(listName === 'applist') {
                let entryHTMLString;
                let appdata = await Profile.findAppMetaData(data.appid);
                if(!appdata) {
                    entryHTMLString = `<div class="userscript-config-list-entry" data-appid="${data.appid}" data-name="">`
                      +    '<a class="app-header"></a>'
                      +    `<div class="conf-list-entry-profile">${data.appid}</div>`
                      +    `<div class="conf-list-entry-descript">${data.descript}</div>`
                      + '</div>';
                } else {
                    entryHTMLString = `<div class="userscript-config-list-entry" data-appid="${appdata.appid}" data-name="${appdata.name}">`
                      +    `<a href="https://steamcommunity.com/my/gamecards/${appdata.appid}}/" target="_blank" rel="noopener noreferrer" class="app-header">`
                      +       `<img src="https://cdn.cloudflare.steamstatic.com/steam/apps/${appdata.appid}/header.jpg" alt="">`
                      +    '</a>'
                      +    `<div class="conf-list-entry-name">${appdata.name}</div>`
                      +    `<div class="conf-list-entry-descript">${data.descript}</div>`
                      + '</div>';
                }


                entriesHTMLString.push({ key1: appdata?.name ?? '', key2: data.appid, string: entryHTMLString });
            } else {
                console.warn('matcherConfigLoadUI(): HTML generation for a list not implemented, that list will be empty!');
                break;
            }
        }

        if(listName === 'applist') {
            entriesHTMLString.sort((a, b) => a.key1==='' ? a.key2-b.key2 : a.key1-b.key1);
        }

        entryGroupElem.insertAdjacentHTML('afterbegin', entriesHTMLString.reduce((str, entry) => str+entry.string, ''));
    }

    // set active tab
    if(globalSettings.matcher.currentTab) {
        MatcherConfigShortcuts.MAIN_ELEM.querySelector(`.userscript-config-list-tab[data-list-name=${globalSettings.matcher.currentTab}]`).classList.add('active');
        matcherConfigShowActiveList();
    }

    matcherConfigResetEntryForm();

    MatcherConfigShortcuts.listOverlayElem.classList.remove('active');
}

function matcherConfigSetEntryActionBar(actionBarName) {
    const validActions = ['add', 'modify'];
    let listActionElem = MatcherConfigShortcuts.listActionBarElem;
    if(validActions.includes(actionBarName)) {
        listActionElem.className = 'conf-list-entry-action ' + actionBarName;
    } else {
        console.warn('matcherConfigSetEntryActionBar(): Action bar name not valid, nothing will change!');
    }
}

function matcherConfigSelectListTabListener(event) {
    console.log(event.target); // debugging
    if(!event.target.matches('.userscript-config-list-tab') || event.target.matches('.active')) {
        return;
    }
    matcherConfigSetListTab(event.target.dataset.listName);
}

function matcherConfigSetListTab(tabName) {
    if(!Object.keys(globalSettings.matcher.lists).includes(tabName)) {
        console.error('matcherConfigSetListTab(): invalid tab name!');
        return;
    }

    MatcherConfigShortcuts.listTabListElem.querySelector(`.userscript-config-list-tab.active`)?.classList.remove('active');
    const target = MatcherConfigShortcuts.listTabListElem.querySelector(`.userscript-config-list-tab[data-list-name=${tabName}]`);
    target.classList.add('active');
    globalSettings.matcher.currentTab = target.dataset.listName;

    if(MatcherConfigShortcuts.selectedListEntryElem) {
        matcherSetOverlay(MatcherConfigShortcuts.listContentsElem, false);
        matcherConfigSelectListEntry(MatcherConfigShortcuts.selectedListEntryElem, true);
    }

    matcherConfigResetEntryForm();
    matcherConfigShowActiveList();
}

function matcherConfigResetEntryForm() {
    let currentTab = globalSettings.matcher.currentTab;

    let entryFormElem = MatcherConfigShortcuts.MAIN_ELEM.querySelector('.conf-list-entry-form');
    let currentFormType = entryFormElem.dataset.type;

    if(currentFormType !== currentTab) {
        // set innerHTML to wipe everything and change form
        entryFormElem.innerHTML = '';
        if(currentTab==='matchlist' || currentTab==='blacklist') {
            entryFormElem.innerHTML = '<input type="text" id="entry-form-id" class="userscript-input" placeholder="profileid/customUrlid">'
              + '<textarea name="" id="entry-form-descript" class="userscript-input" placeholder="Note (Optional)" rows="5"></textarea>';
        } else if(currentTab === 'applist') {
            entryFormElem.innerHTML = '<input type="text" id="entry-form-id" class="userscript-input" placeholder="appid">'
              + '<textarea name="" id="entry-form-descript" class="userscript-input" placeholder="Note (Optional)" rows="5"></textarea>';
        } else {
            console.warn('matcherConfigResetEntryForm(): Tab reset not implemented, form will not be generated!');
            return;
        }

        let entryFormActionHTMLString = '<div class="userscript-dialog-container">'
          +    '<button id="dialog-form-cancel" class="userscript-btn red">Cancel</button>'
          +    '<button id="dialog-form-add" class="userscript-btn green">Add</button>'
          + '</div>';
        entryFormElem.insertAdjacentHTML('beforeend', entryFormActionHTMLString);
        document.getElementById('dialog-form-cancel').addEventListener('click', matcherConfigEntryFormCancelListener);
        document.getElementById('dialog-form-add').addEventListener('click', matcherConfigEntryFormAddListener);

        entryFormElem.dataset.type = currentTab;
    } else {
        // reset input values
        if(currentTab === 'matchlist' || currentTab === 'blacklist') {
            entryFormElem.querySelector('#entry-form-id').value = '';
            entryFormElem.querySelector('#entry-form-descript').value = '';
        } else if(currentTab === 'applist') {
            entryFormElem.querySelector('#entry-form-id').value = '';
            entryFormElem.querySelector('#entry-form-descript').value = '';
        } else {
            console.warn('matcherConfigResetEntryForm(): Tab reset not implemented, form will not be generated!');
            return;
        }
    }
}

function matcherConfigShowActiveList() {
    let currentTab = globalSettings.matcher.currentTab;
    for(let listGroup of MatcherConfigShortcuts.MAIN_ELEM.querySelectorAll(`.userscript-config-list-entry-group`)) {
        if(currentTab !== listGroup.dataset.listName) {
            listGroup.classList.remove('active');
        } else {
            listGroup.classList.add('active');
        }
    }
}

function matcherConfigSelectListEntryListener(event) {
    console.log(event.target);
    let entryElem = event.target;
    while (!entryElem.matches('.userscript-config-list-entries')) {
        if(entryElem.matches('.userscript-config-list-entry')) {
            break;
        } else {
            entryElem = entryElem.parentElement;
        }
    }
    if(!entryElem.matches('.userscript-config-list-entry')) {
        return;
    }

    matcherConfigSelectListEntry(entryElem);
}

function matcherConfigSelectListEntry(entryElem, toggle = true) {
    if(!entryElem.classList.contains('selected')) {
        if(MatcherConfigShortcuts.selectedListEntryElem) {
            MatcherConfigShortcuts.selectedListEntryElem.classList.remove('selected');
        }

        MatcherConfigShortcuts.selectedListEntryElem = entryElem;
        entryElem.classList.add('selected');
        matcherConfigSetEntryActionBar('modify');
    } else if(toggle) {
        entryElem.classList.remove('selected');
        MatcherConfigShortcuts.selectedListEntryElem = undefined;

        matcherConfigResetEntryForm();
        matcherConfigSetEntryActionBar('add');
    }
}

// needs testing
function matcherConfigUpdateChecklistListener(event) {
    console.log(event.currentTarget); // debugging
    if(!event.target.matches('input')) {
        return;
    }
    let groupId = event.currentTarget.dataset.id;
    let optionId = event.target.id;

    for(let group of Object.values(globalSettings.matcher.config)) {
        if(group.id === groupId) {
            group.options.find(x => x.id === optionId).value = event.target.checked;
        }
    }
}

// add new config list entry, populated input values persist when form is minimized
function matcherConfigAddListEntryListener(event) {
    MatcherConfigShortcuts.listFormContainerElem.classList.toggle('active');
}

// modify selected HTML that is selected
function matcherConfigEditListEntryListener(event) {
    /* edit selected entry, prefilled with selected entry info */
    let currentTab = globalSettings.matcher.currentTab;
    if(MatcherConfigShortcuts.listFormContainerElem.matches('.active')) {
        MatcherConfigShortcuts.listFormContainerElem.classList.remove('active');
        return;
    }

    if(!MatcherConfigShortcuts.selectedListEntryElem) {
        console.log('matcherConfigEditListEntryListener(): No entry selected, nothing can be edited...');
        return;
    }

    if(currentTab === 'matchlist' || currentTab === 'blacklist') {
        MatcherConfigShortcuts.MAIN_ELEM.querySelector('#entry-form-id').value = MatcherConfigShortcuts.selectedListEntryElem.dataset.profileid;
        MatcherConfigShortcuts.MAIN_ELEM.querySelector('#entry-form-descript').value = MatcherConfigShortcuts.selectedListEntryElem.querySelector('.conf-list-entry-descript').textContent;
    } else if(currentTab === 'applist') {
        MatcherConfigShortcuts.MAIN_ELEM.querySelector('#entry-form-id').value = MatcherConfigShortcuts.selectedListEntryElem.dataset.appid;
        MatcherConfigShortcuts.MAIN_ELEM.querySelector('#entry-form-descript').value = MatcherConfigShortcuts.selectedListEntryElem.querySelector('.conf-list-entry-descript').textContent;
    } else {
        console.warn('matcherConfigEditListEntryListener(): Entry edit prefill not implemented, form will not be prefilled!');
        return;
    }

    MatcherConfigShortcuts.listFormContainerElem.classList.add('active');
}

// delete selected HTML elements
function matcherConfigDeleteListEntryListener(event) {
    if(!MatcherConfigShortcuts.selectedListEntryElem) {
        console.log('matcherConfigDeleteListEntryListener(): No entry selected, nothing is removed...');
        return;
    }
    let listGroup = MatcherConfigShortcuts.selectedListEntryElem.parentElement.dataset.listName;
    if(!globalSettings.matcher.lists[listGroup]) {
        console.warn('matcherConfigDeleteListEntryListener(): List not found, something is wrong!');
        return;
    }

    if(listGroup==='matchlist' || listGroup==='blacklist') {
        let profileid = MatcherConfigShortcuts.selectedListEntryElem.dataset.profileid;
        let selectedIndex = globalSettings.matcher.lists[listGroup].data.findIndex(x => x.profileid === profileid);
        if(selectedIndex === -1) {
            console.warn('matcherConfigDeleteListEntryListener(): Profileid not found, which means list and data are not synced!');
            return;
        }
        globalSettings.matcher.lists[listGroup].data.splice(selectedIndex, 1);
        MatcherConfigShortcuts.selectedListEntryElem.remove();
        MatcherConfigShortcuts.selectedListEntryElem = undefined;
        matcherConfigSetEntryActionBar('add');
    } else if(listGroup === 'applist') {
        let appid = MatcherConfigShortcuts.selectedListEntryElem.dataset.appid;
        let selectedIndex = globalSettings.matcher.lists[listGroup].data.findIndex(x => x.appid === appid);
        if(selectedIndex === -1) {
            console.warn('matcherConfigDeleteListEntryListener(): Appid not found, which means list and data are not synced!');
            return;
        }
        globalSettings.matcher.lists[listGroup].data.splice(selectedIndex, 1);
        MatcherConfigShortcuts.selectedListEntryElem.remove();
        MatcherConfigShortcuts.selectedListEntryElem = undefined;
        matcherConfigSetEntryActionBar('add');
    } else {
        console.warn('matcherConfigDeleteListEntryListener(): List deletion not implemented, nothing will be changed!');
    }
}

async function matcherConfigEntryFormAddListener(event) {
    let currentTab = globalSettings.matcher.currentTab;

    if(currentTab==='matchlist' || currentTab==='blacklist') {
        MatcherConfigShortcuts.listActionBarElem.classList.add('disabled');
        MatcherConfigShortcuts.listOverlayElem.classList.add('active');

        const formElem = MatcherConfigShortcuts.listFormContainerElem.querySelector('.conf-list-entry-form');
        let profileValue = formElem.querySelector('#entry-form-id').value;
        let description = formElem.querySelector('#entry-form-descript').value;
        let profileEntry;

        if(steamToolsUtils.isSteamId64Format(profileValue)) {
            profileEntry = globalSettings.matcher.lists[currentTab].data.find(x => x.profileid === profileValue);
        }

        if(profileEntry) {
            // app found: prompt user if they want to overwrite existing data
            let selectedEntryElem = MatcherConfigShortcuts.listElems[currentTab].querySelector(`.userscript-config-list-entry[data-profileid="${profileEntry.profileid}"]`);
            MatcherConfigShortcuts.entryEditOld = profileEntry;
            MatcherConfigShortcuts.entryEditNew = { descript: description };
            matcherConfigSelectListEntry(selectedEntryElem, false);
            document.getElementById('conf-list-entry-old').innerHTML = selectedEntryElem.innerHTML;
            document.getElementById('conf-list-entry-new').innerHTML = selectedEntryElem.innerHTML;
            document.getElementById('conf-list-entry-new').querySelector('.conf-list-entry-descript').textContent = description;
            MatcherConfigShortcuts.listDialogElem.classList.add('active');
            return;
        } else {
            let profile = await Profile.findProfile(profileValue);
            if(profile) {
                profileEntry = globalSettings.matcher.lists[currentTab].data.find(x => x.profileid === profile.id);
                if(profileEntry) {
                    // app found: prompt user if they want to overwrite existing data
                    let selectedEntryElem = MatcherConfigShortcuts.listElems[currentTab].querySelector(`.userscript-config-list-entry[data-profileid="${profileEntry.profileid}"]`);
                    MatcherConfigShortcuts.entryEditOld = profileEntry;
                    MatcherConfigShortcuts.entryEditNew = { descript: description };
                    matcherConfigSelectListEntry(selectedEntryElem, false);
                    document.getElementById('conf-list-entry-old').innerHTML = selectedEntryElem.innerHTML;
                    document.getElementById('conf-list-entry-new').innerHTML = selectedEntryElem.innerHTML;
                    document.getElementById('conf-list-entry-new').querySelector('.conf-list-entry-descript').textContent = description;
                    MatcherConfigShortcuts.listDialogElem.classList.add('active');
                    return;
                } else {
                    let entryGroupElem = MatcherConfigShortcuts.listElems[currentTab];
                    let tradeTokenWarning = currentTab === 'blacklist' || Profile.me?.isFriend(profile) || profile.tradeToken;
                    let entryHTMLString = `<div class="userscript-config-list-entry${tradeTokenWarning ? '' : ' warn'}" data-profileid="${profile.id}" ${profile.url ? `data-url="${profile.url}"` : ''} data-name="${profile.name}">`
                      +    `<a href="https://steamcommunity.com/${profile.url ? `id/${profile.url}` : `profiles/${profile.id}`}/" target="_blank" rel="noopener noreferrer" class="avatar offline">`
                      +       `<img src="https://avatars.akamai.steamstatic.com/${profile.pfp}.jpg" alt="">`
                      +    '</a>'
                      +    `<div class="conf-list-entry-name" title="${profile.name}" >${profile.name}</div>`
                      +    `<div class="conf-list-entry-descript">${description}</div>`
                      + '</div>';

                    entryGroupElem.insertAdjacentHTML('afterbegin', entryHTMLString);
                    globalSettings.matcher.lists[currentTab].data.push({ profileid: profile.id, descript: description });
                }
            } else {
                alert('No valid profile found. Data will not be added!');
            }
        }

        MatcherConfigShortcuts.listOverlayElem.classList.remove('active');
        MatcherConfigShortcuts.listFormContainerElem.classList.remove('active');
        MatcherConfigShortcuts.listActionBarElem.classList.remove('disabled');
    } else if(currentTab === 'applist') {
        MatcherConfigShortcuts.listActionBarElem.classList.add('disabled');
        MatcherConfigShortcuts.listOverlayElem.classList.add('active');

        const formElem = MatcherConfigShortcuts.listFormContainerElem.querySelector('.conf-list-entry-form');
        let appid = parseInt(formElem.querySelector('#entry-form-id').value);
        let description = formElem.querySelector('#entry-form-descript').value;
        let appidEntry = globalSettings.matcher.lists[currentTab].data.find(x => x.appid === appid);

        if(appidEntry) {
            // app found: prompt user if they want to overwrite existing data
            let selectedEntryElem = MatcherConfigShortcuts.listElems[currentTab].querySelector(`.userscript-config-list-entry[data-appid="${appidEntry.appid}"]`);
            MatcherConfigShortcuts.entryEditOld = appidEntry;
            MatcherConfigShortcuts.entryEditNew = { descript: description };
            matcherConfigSelectListEntry(selectedEntryElem, false);
            document.getElementById('conf-list-entry-old').innerHTML = selectedEntryElem.innerHTML;
            document.getElementById('conf-list-entry-new').innerHTML = selectedEntryElem.innerHTML;
            document.getElementById('conf-list-entry-new').querySelector('.conf-list-entry-descript').textContent = description;
            MatcherConfigShortcuts.listDialogElem.classList.add('active');
            return;
        } else {
            let appdata = await Profile.findAppMetaData(appid);
            if(!appdata) {
                // no appdata exists, could possibly mean that community data was nuked (eg 梦中女孩) even if the items still exist
                // therefore don't reject entry submission and add entry
                let entryHTMLString = `<div class="userscript-config-list-entry" data-appid="${appid}" data-name="">`
                  +    '<a class="app-header"></a>'
                  +    `<div class="conf-list-entry-profile">${appid}</div>`
                  +    `<div class="conf-list-entry-descript">${description}</div>`
                  + '</div>';

                MatcherConfigShortcuts.listElems[currentTab].insertAdjacentHTML('beforeend', entryHTMLString);
                globalSettings.matcher.lists[currentTab].data.push({ appid: appid, descript: description });
            } else {
                let insertBeforeThisEntry;
                for(let entryElem of MatcherConfigShortcuts.listElems[currentTab].querySelectorAll(`.userscript-config-list-entry`)) {
                    if(entryElem.dataset.name && appdata.name.localeCompare(entryElem.dataset.name) < 0) {
                        insertBeforeThisEntry = entryElem;
                        break;
                    }
                }
                let entryHTMLString = `<div class="userscript-config-list-entry" data-appid="${appdata.appid}" data-name="${appdata.name}">`
                  +    `<a href="https://steamcommunity.com/my/gamecards/${appdata.appid}}/" target="_blank" rel="noopener noreferrer" class="app-header">`
                  +       `<img src="https://cdn.cloudflare.steamstatic.com/steam/apps/${appdata.appid}/header.jpg" alt="">`
                  +    '</a>'
                  +    `<div class="conf-list-entry-name">${appdata.name}</div>`
                  +    `<div class="conf-list-entry-descript">${description}</div>`
                  + '</div>';

                insertBeforeThisEntry.insertAdjacentHTML('beforebegin', entryHTMLString);
                let entryIndex = globalSettings.matcher.lists[currentTab].data.findIndex(x => x.appid === parseInt(insertBeforeThisEntry.dataset.appid));
                globalSettings.matcher.lists[currentTab].data.splice(entryIndex - 1, 0, { appid: appdata.appid, descript: description });
            }

            MatcherConfigShortcuts.listOverlayElem.classList.remove('active');
            MatcherConfigShortcuts.listFormContainerElem.classList.remove('active');
            MatcherConfigShortcuts.listActionBarElem.classList.remove('disabled');
        }
    } else {
        console.warn('matcherConfigEntryFormAddListener(): Tab entry submission not implemented, no entry modified/added!');
    }
}

function matcherConfigEntryFormCancelListener(event) {
    let currentTab = globalSettings.matcher.currentTab;
    if(currentTab === 'matchlist' || currentTab === 'blacklist') {
        MatcherConfigShortcuts.MAIN_ELEM.querySelector('#entry-form-id').value = '';
        MatcherConfigShortcuts.MAIN_ELEM.querySelector('#entry-form-descript').value = '';
    } else if(currentTab === 'applist') {
        MatcherConfigShortcuts.MAIN_ELEM.querySelector('#entry-form-id').value = '';
        MatcherConfigShortcuts.MAIN_ELEM.querySelector('#entry-form-descript').value = '';
    } else {
        console.warn('matcherConfigEntryFormCancelListener(): Entry form cancel not implemented, form will not be cleared!');
    }

    MatcherConfigShortcuts.listFormContainerElem.classList.remove('active');
}

function matcherConfigListDialogCancelListener(event) {
    MatcherConfigShortcuts.listDialogElem.classList.remove('active');
    document.getElementById('conf-list-entry-old').innerHTML = '';
    document.getElementById('conf-list-entry-new').innerHTML = '';
    MatcherConfigShortcuts.listOverlayElem.classList.remove('active');
    MatcherConfigShortcuts.listActionBarElem.classList.remove('disabled');
    //MatcherConfigShortcuts.listFormContainerElem.classList.remove('active');
    MatcherConfigShortcuts.entryEditOld = undefined;
    MatcherConfigShortcuts.entryEditNew = undefined;
}

function matcherConfigListDialogConfirmListener(event) {
    Object.assign(MatcherConfigShortcuts.entryEditOld, MatcherConfigShortcuts.entryEditNew);
    MatcherConfigShortcuts.selectedListEntryElem.innerHTML = document.getElementById('conf-list-entry-new').innerHTML;
    MatcherConfigShortcuts.listDialogElem.classList.remove('active');
    document.getElementById('conf-list-entry-old').innerHTML = '';
    document.getElementById('conf-list-entry-new').innerHTML = '';
    MatcherConfigShortcuts.listOverlayElem.classList.remove('active');
    MatcherConfigShortcuts.listActionBarElem.classList.remove('disabled');
    MatcherConfigShortcuts.listFormContainerElem.classList.remove('active');
    matcherConfigResetEntryForm();
    MatcherConfigShortcuts.entryEditOld = undefined;
    MatcherConfigShortcuts.entryEditNew = undefined;
}

async function matcherConfigImportListener() {
    const isValidConfigObject = obj => {
        if(obj.config && !steamToolsUtils.isSimplyObject(obj.config)) {
            return false;
        }
        for(let optionGroup of Object.values(obj.config)) {
            if(!steamToolsUtils.isSimplyObject(optionGroup) || !Array.isArray(optionGroup.options)) {
                return false;
            }
            for(let option of optionGroup.options) {
                if(typeof option.name !== 'string' || typeof option.id !== 'string' || typeof option.label !== 'string' || typeof option.value !== 'boolean') {
                    return false;
                }
            }
        }

        if(obj.lists && !steamToolsUtils.isSimplyObject(obj.lists)) {
            return false;
        }
        for(let list of Object.values(obj.lists)) {
            if(!steamToolsUtils.isSimplyObject(list) || !Array.isArray(list.data)) {
                return false;
            }
        }

        return true;
    }

    let importedConfig = await importConfig('matcher');
    if(!isValidConfigObject(importedConfig)) {
        throw 'matcherConfigImportListener(): Invalid imported config!';
    }

    globalSettings.matcher = importedConfig;
    matcherConfigLoadUI();
}

async function matcherConfigExportListener() {
    exportConfig('matcher', 'SteamMatcherConfig');
}

async function matcherConfigSaveListener() {
    await SteamToolsDbManager.setToolConfig('matcher');
}

async function matcherConfigLoadListener() {
    let config = await SteamToolsDbManager.getToolConfig('matcher');
    if(config.matcher) {
        globalSettings.matcher = config.matcher;
        matcherConfigLoadUI();
    }
}

function matcherConfigResetDefaultListener() {
    // prompt user to confirm action

    globalSettings.matcher = steamToolsUtils.deepClone(GLOBALSETTINGSDEFAULTS.matcher);
    matcherConfigLoadUI();
}

function matcherConfigFullMatchListener() {
    console.warn('matcherConfigFullMatchListener(): Not Implemented Yet!');

    // check if settings are the same in db, prompt user to save if they want
    // generate matcher page with a loading animation
    // defer to an in-progress matching function
}

async function matcherConfigSingleMatchListener() {
    // verify that the provided profileid/customurl is valid, cancel if invalid
    // check if settings are the same in db, prompt user to save if they want
    // generate matcher page with a loading animation
    // defer to an in-progress matching function
    MatcherConfigShortcuts.configMenu.classList.add('overlay');
    MatcherConfigShortcuts.matchSingleProfileProfileid.value = MatcherConfigShortcuts.matchSingleProfileProfileid.value.trim();
    let profile = await Profile.findProfile(MatcherConfigShortcuts.matchSingleProfileProfileid.value);
    if(!profile || (await profile.isMe())) {
        alert('Invalid profile!');
        MatcherConfigShortcuts.configMenu.classList.remove('overlay');
        return;
    }

    let savedConfig = await SteamToolsDbManager.getToolConfig('matcher');
    if(JSON.stringify(globalSettings.matcher) !== JSON.stringify(savedConfig.matcher)) {
        let userPrompt = prompt('WARNING: Settings have not been saved! Save now? (y/n/cancel)');
        if(!userPrompt[0].localeCompare('y', 'en', { sensitivity: 'base' })) {
            await SteamToolsDbManager.setToolConfig('matcher');
            console.log('matcherConfigSingleMatchListener(): Saved Settings. Continuing to matching process...');
        } else if(!userPrompt[0].localeCompare('n', 'en', { sensitivity: 'base' })) {
            console.log('matcherConfigSingleMatchListener(): Settings will not be saved. Continuing to matching process...');
        } else if(!userPrompt[0].localeCompare('c', 'en', { sensitivity: 'base' })) {
            console.log('matcherConfigSingleMatchListener(): Cancelled. Matching will not continue...');
            MatcherConfigShortcuts.configMenu.classList.remove('overlay');
            return;
        } else {
            console.log('matcherConfigSingleMatchListener(): Invalid input. Matching will not continue...');
            MatcherConfigShortcuts.configMenu.classList.remove('overlay');
            return;
        }
    }

    await matcherStartMatching(profile);
}

async function matcherStartMatching(profile) {
    const generateMatchGroupString = (groupName) => `<div class="match-group" data-group="${groupName}"></div>`;
    const generateMatchNameHeaderString = (profile, reverseDirection = false) => {
        return `<div class="match-name${reverseDirection ? ' align-right' : ''}">`
          +    `<a href="https://steamcommunity.com/${profile.url ? `id/${profile.url}/` : `profiles/${profile.id}/`}" class="avatar ${profile.getStateString()}">`
          +       `<img src="https://avatars.akamai.steamstatic.com/${profile.pfp}.jpg" alt="">`
          +    '</a>'
          +    profile.name
          + '</div>'
    };
    const generateMatchContainerString = (profile1, profile2) => {
        return '<div class="match-container-outer loading">'
          +    `<div class="match-container grid" data-profileid1="${profile1.id}" data-profileid2="${profile2.id}">`
          +       '<div class="match-header">'
          +          generateMatchNameHeaderString(profile1, true)
          +          '<div class="match-item-action trade"></div>'
          +          generateMatchNameHeaderString(profile2)
          +       '</div>'
          +    '</div>'
          +    cssAddOverlay(cssAddThrobber())
          + '</div>'
    };

    GM_addStyle(cssMatcher);

    console.warn('matcherStartMatching(): Not Implemented Yet!');
    // UI setup (remove tool supernav)
    Object.keys(MatcherConfigShortcuts).forEach(key => (key === 'MAIN_ELEM') || delete MatcherConfigShortcuts[key]);
    MatcherConfigShortcuts.MAIN_ELEM.innerHTML = '<div class="match-results">'
      + '</div>';

    addSvgBlock(MatcherConfigShortcuts.MAIN_ELEM);

    MatcherConfigShortcuts.results = MatcherConfigShortcuts.MAIN_ELEM.querySelector('.match-results');
    MatcherConfigShortcuts.resultGroups = {};

    if(!Profile.me) {
        await Profile.addNewProfile(steamToolsUtils.getMySteamId());
    }

    if(profile) {
        MatcherConfigShortcuts.results.insertAdjacentHTML('beforeend', generateMatchGroupString('single'));
        MatcherConfigShortcuts.resultGroups.single = MatcherConfigShortcuts.results.querySelector('[data-group="single"]');
        MatcherConfigShortcuts.resultGroups.single.insertAdjacentHTML('beforeend', generateMatchContainerString(Profile.me, profile));

        await matcherMatchProfile();

        let emptyContainer = MatcherConfigShortcuts.resultGroups.single.querySelector('.match-container-outer.loading');
        if(emptyContainer) {
            emptyContainer.remove();
        }
    }

    // friend group matching
    //    generate match block on document
    //    check against blacklist
    //    begin matching (no trade token is necessary)
    // asf group matching
    //    generate match block on document
    //    grab asf profile from the asf api if needed
    //    check for any/fair group selection from config
    //    check against blacklist
    //    find asf profiles and add their trade tokens as well
    //    begin matching (trade token should already be auto added from the asf data)
    // custom list
    //    generate match block on document
    //    check against blacklist
    //    begin matching (trade token should be provided by the user)

    // finish matching process here
}

async function matcherMatchProfile() {
    const generateItemTypeContainerString = (itemType) => `<div class="match-item-type" data-type="${itemType}"></div>`;
    const generateRarityContainerString = (rarity) => `<div class="match-item-rarity" data-rarity="${rarity}"></div>`;
    const generateAppContainerString = (appid) => `<div class="match-item-app" data-appid="${appid}"></div>`;
    const generateItemListContainerString = (itemType, rarity, appid, swapList) => {
        return '<div class="match-item-list left">'
          +    generateAppItemsString(itemType, rarity, appid, swapList, true)
          + '</div>'
          + '<div class="match-item-action trade"></div>'
          + '<div class="match-item-list right">'
          +    generateAppItemsString(itemType, rarity, appid, swapList, false)
          + '</div>';
    };
    const generateAppItemsString = (itemType, rarity, appid, swapList, leftSide = true) => {
        const getClassid = (index) => matchResult.inventory1.data[itemType][rarity][appid][index].classid;
        const generateAppItemString = (qty, i) => {
            let itemClassid = getClassid(i);
            let itemDescription = Profile.itemDescriptions[itemClassid];
            return `<div class="match-item" data-classid="${itemClassid}" data-qty="${Math.abs(qty)}" title="${itemDescription.name}">`
              +    `<img src="${'https://community.cloudflare.steamstatic.com/economy/image/' + itemDescription.icon_url + '/96fx96f?allow_animated=1'}" alt="${itemDescription.name}">`
              +    `<div class="match-item-name">${itemDescription.name}</div>`
              + '</div>';
        };

        return swapList.map((swapAmount, index) =>
            leftSide ? (swapAmount < 0 ? generateAppItemString(swapAmount, index) : '') : (swapAmount > 0 ? generateAppItemString(swapAmount, index) : '')
        ).join('');
    }

    let shortcuts = {};
    let loadingContainer = MatcherConfigShortcuts.results.querySelector('.match-container-outer.loading > .match-container');
    if(!loadingContainer) {
        console.warn('matcherMatchProfile(): No loading container found!');
        return;
    }

    let matchResult = await Matcher.matchInv(loadingContainer.dataset.profileid1, loadingContainer.dataset.profileid2);
    if(!matchResult || steamToolsUtils.isEmptyObject(matchResult.results)) {
        console.warn('matcherMatchProfile(): No results to be rendered');
        return;
    }

    for(let result in matchResult.results) {
        let [itemType, rarity, appid] = result.split('_');

        shortcuts[itemType] ??= { elem: null, rarities: {} };
        if(!shortcuts[itemType].elem) {
            loadingContainer.insertAdjacentHTML('beforeend', generateItemTypeContainerString(itemType));
            shortcuts[itemType].elem = loadingContainer.querySelector(`[data-type="${itemType}"]`);
        }
        shortcuts[itemType].rarities[rarity] ??= { elem: null, appids: {} };
        if(!shortcuts[itemType].rarities[rarity].elem) {
            shortcuts[itemType].elem.insertAdjacentHTML('beforeend', generateRarityContainerString(rarity));
            shortcuts[itemType].rarities[rarity].elem = shortcuts[itemType].elem.querySelector(`[data-rarity="${rarity}"]`);
        }
        shortcuts[itemType].rarities[rarity].appids[appid] ??= { elem: null };
        if(!shortcuts[itemType].rarities[rarity].appids[appid].elem) {
            shortcuts[itemType].rarities[rarity].elem.insertAdjacentHTML('beforeend', generateAppContainerString(appid));
            shortcuts[itemType].rarities[rarity].appids[appid].elem = shortcuts[itemType].rarities[rarity].elem.querySelector(`[data-appid="${appid}"]`);
        }
        shortcuts[itemType].rarities[rarity].appids[appid].elem.insertAdjacentHTML('beforeend', generateItemListContainerString(itemType, rarity, appid, matchResult.results[result].swap));
    }

    console.log(matchResult);
    console.log(Profile.itemDescriptions)


    loadingContainer.parentElement.classList.remove('loading');
}

function matcherSetOverlay(overlayParentElem, overlayEnable, overlayState) {
    if(overlayEnable) {
        overlayParentElem.classList.add('overlay');
    } else {
        overlayParentElem.classList.remove('overlay');
    }

    if(typeof overlayState === 'string') {
        let overlayElem;
        for(let childElem of overlayParentElem.children) {
            if(childElem.matches('.userscript-overlay')) {
                if(overlayElem) {
                    console.warn('matcherSetOverlay(): Multiple overlay elements detected on same parent!');
                }
                overlayElem = childElem;
            }
        }

        if(!overlayElem) {
            console.warn('matcherSetOverlay(): No overlay element found in immediate children!');
            return;
        }

        overlayElem.className = 'userscript-overlay ' + overlayState;
    }
}

async function getASFProfiles() {
    const REQUEST_URL = 'https://asf.justarchi.net/Api/Listing/Bots';
    const MATCHABLE_TYPES = {
        "2": 'emoticon',
        "3": 'card',
        "4": 'background',
        "5": 'card'
    }

    let result = await new Promise((resolve, reject) => {
        const resolveError = (mssg) => {
            console.error(mssg);
            resolve();
        };

        GM_xmlhttpRequest({
            method: 'GET',
            url: REQUEST_URL,
            onload(response) {
                if(response.status !== 200) {
                    resolveError('getASFProfiles(): Status code ' + response.status);
                }

                // NOTE: avoid using 'SteamID' property (always exceeds MAX_SAFE_INTEGER, therefore incorrect value)
                let datalist = JSON.parse(response.response);
                if(!datalist.Success) {
                    resolveError('getASFProfiles(): Response object not successful!');
                }
                datalist = datalist.Result;
                for(let i=0; i<datalist.length; ++i) {
                    let profileData = datalist[i];
                    let cardTypes = (profileData.MatchableTypes.includes(5) ? 1 : 0)
                      + (profileData.MatchableTypes.includes(3) ? 2 : 0)

                    datalist[i] = {
                        id: profileData.SteamIDText,
                        name: profileData.Nickname,
                        pfp: profileData.AvatarHash,
                        tradeToken: profileData.TradeToken,
                        matchTypes: profileData.MatchableTypes.map(x => MATCHABLE_TYPES[x]),
                        matchAny: profileData.MatchEverything,
                        matchTradeholdMax: profileData.MaxTradeHoldDuration,
                        matchCardTypes: cardTypes,
                        countGame: profileData.TotalGamesCount,
                        countInventory: profileData.TotalInventoryCount,
                        countTradables: profileData.TotalItemsCount
                    }
                }

                resolve(datalist);
            },
            onerror(response) {
                resolveError('getASFProfiles(): Error requesting ASF profiles!');
            },
            onabort(response) {
                resolveError('getASFProfiles(): Aborted!');
            },
            ontimeout(response) {
                resolveError('getASFProfiles(): Request timeout!');
            }
        });
    });

    return result;
}
