const SteamItemMatcher = {
    SETTINGSDEFAULTS: {
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
    },

    configShortcuts: {},
    shortcuts: {},

    setup: async function() {
        const generateConfigHeaderString = (title) => `<div class="userscript-config-header"><span>${title}</span></div>`;
        const generateConfigButtonString = (id, label) => `<div class="userscript-config-option"><input type="checkbox" class="button" id="${id}"><label for="${id}">${label}</label></div>`;
        const generateConfigButtonsString = (checkList) => checkList.map(x => generateConfigButtonString(x.id, x.label)).join('');
        const generateConfigButtonGroupString = () => Object.values(globalSettings.matcherConfig.config).map(x => {
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

        SteamItemMatcher.configShortcuts.MAIN_ELEM = document.querySelector('#responsive_page_template_content');

        if(!SteamItemMatcher.configShortcuts.MAIN_ELEM) {
            alert('Main element no found, Matcher Configuration will not be set up');
            console.warn('SteamItemMatcher.setup(): Main element no found, Matcher Configuration will not be set up!');
            return;
        }

        // set up css styles for this feature
        GM_addStyle(cssGlobal);

        SteamItemMatcher.configShortcuts.MAIN_ELEM.innerHTML = '';
        document.body.classList.remove('profile_page'); // profile page causes bg color to be black

        let config = await SteamToolsDbManager.getToolConfig('matcherConfig');
        if(config.matcherConfig) {
            globalSettings.matcherConfig = config.matcherConfig;
        } else {
            globalSettings.matcherConfig = steamToolsUtils.deepClone(SteamItemMatcher.SETTINGSDEFAULTS);
        }

        addSvgBlock(SteamItemMatcher.configShortcuts.MAIN_ELEM);

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
          +          generateConfigListTabs(globalSettings.matcherConfig.lists)
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
          +             generateConfigListGroups(globalSettings.matcherConfig.lists)
          +          '</div>'
          +       '</div>'
          +    '</div>'
          +    cssAddOverlay(cssAddThrobber(), {initialState: 'loading'})
          + '</div>';

        SteamItemMatcher.configShortcuts.MAIN_ELEM.insertAdjacentHTML("beforeend", matcherConfigHTMLString);

        // element shortcuts
        SteamItemMatcher.configShortcuts.configMenu = SteamItemMatcher.configShortcuts.MAIN_ELEM.querySelector('.userscript-config');
        SteamItemMatcher.configShortcuts.listContainer = SteamItemMatcher.configShortcuts.MAIN_ELEM.querySelector('.userscript-config-list');
        SteamItemMatcher.configShortcuts.listTabListElem = SteamItemMatcher.configShortcuts.listContainer.querySelector('.userscript-config-list-header.tabs');
        SteamItemMatcher.configShortcuts.listActionBarElem = SteamItemMatcher.configShortcuts.listContainer.querySelector('.conf-list-entry-action');
        SteamItemMatcher.configShortcuts.listContentsElem = SteamItemMatcher.configShortcuts.MAIN_ELEM.querySelector('.userscript-config-list-list');
        SteamItemMatcher.configShortcuts.listDialogElem = SteamItemMatcher.configShortcuts.listContentsElem.querySelector('.userscript-dialog');
        SteamItemMatcher.configShortcuts.listFormElem = SteamItemMatcher.configShortcuts.listContentsElem.querySelector('.userscript-dialog-form');
        SteamItemMatcher.configShortcuts.listElems = {};
        for(let entryGroup in globalSettings.matcherConfig.lists) {
            SteamItemMatcher.configShortcuts.listElems[entryGroup] = SteamItemMatcher.configShortcuts.MAIN_ELEM.querySelector(`.userscript-config-list-entry-group[data-list-name=${entryGroup}]`);
        }

        for(let buttonGroup of SteamItemMatcher.configShortcuts.MAIN_ELEM.querySelectorAll('.userscript-config-group')) {
            buttonGroup.addEventListener('change', SteamItemMatcher.configUpdateChecklistListener);
        }
        document.getElementById('userscript-config-import').addEventListener('click', SteamItemMatcher.configImportListener);
        document.getElementById('userscript-config-export').addEventListener('click', SteamItemMatcher.configExportListener);
        document.getElementById('userscript-config-reset').addEventListener('click', SteamItemMatcher.configLoadListener);
        document.getElementById('userscript-config-save').addEventListener('click', SteamItemMatcher.configSaveListener);
        SteamItemMatcher.configShortcuts.MAIN_ELEM.querySelector('.userscript-config-list-header').addEventListener('click', SteamItemMatcher.configSelectListTabListener);
        document.getElementById('entry-action-add').addEventListener('click', SteamItemMatcher.configToggleEntryFormListener);
        document.getElementById('entry-action-edit').addEventListener('click', SteamItemMatcher.configEditListEntryListener);
        document.getElementById('entry-action-del').addEventListener('click', SteamItemMatcher.configDeleteListEntryListener);
        SteamItemMatcher.configShortcuts.MAIN_ELEM.querySelector('.userscript-config-list-entries').addEventListener('click', SteamItemMatcher.configSelectListEntryListener);
        document.getElementById('userscript-dialog-cancel').addEventListener('click', SteamItemMatcher.configListDialogCancelListener);
        document.getElementById('userscript-dialog-confirm').addEventListener('click', SteamItemMatcher.configListDialogConfirmListener);
        document.getElementById('userscript-config-match-full').addEventListener('click', SteamItemMatcher.configFullMatchListener);
        document.getElementById('userscript-config-match-one').addEventListener('click', SteamItemMatcher.configSingleMatchListener);

        SteamItemMatcher.configShortcuts.matchSingleProfileProfileid = document.getElementById('match-single-profile-profileid');

        SteamItemMatcher.configLoadUI();
    },

    configLoadUI: async function() {
        if(!SteamItemMatcher.configShortcuts.configMenu) {
            console.warn('updateMatcherConfigUI(): Config menu not found, UI will not be updated');
            return;
        }

        SteamItemMatcher.setOverlay(SteamItemMatcher.configShortcuts.listContentsElem, true, 'loading');

        for(let optionGroup of Object.values(globalSettings.matcherConfig.config)) {
            for(let option of optionGroup.options) {
                document.getElementById(option.id).checked = option.value;
            }
        }

        // generate lists
        for(let [listName, listGroup] of Object.entries(globalSettings.matcherConfig.lists)) {
            let entryGroupElem = SteamItemMatcher.configShortcuts.listElems[listName];
            let entriesHTMLString = [];
            for(let data of listGroup.data) {
                if(listName==='matchlist' || listName==='blacklist') {
                    let profile = await Profile.findProfile(data.profileid);
                    if(!profile) {
                        console.warn('SteamItemMatcher.configLoadUI(): No profile found, skipping this entry...');
                        continue;
                    }

                    let tradeTokenWarning = listName === 'blacklist' || Profile.me?.isFriend(profile) || profile.tradeToken;
                    let entryHTMLString = `<div class="userscript-config-list-entry${tradeTokenWarning ? '' : ' warn'}" data-profileid="${profile.id}" ${profile.url ? `data-url="${profile.url}"` : ''} data-name="${profile.name}">`
                      +    `<a href="https://steamcommunity.com/${profile.url ? `id/${profile.url}` : `profiles/${profile.id}`}/" target="_blank" rel="noopener noreferrer" class="avatar ${profile.getStateString()}">`
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
                          +    '<a class="app-header">'
                          +       `<img src="https://cdn.cloudflare.steamstatic.com/steam/apps/${appdata.appid}/header.jpg" alt="">`
                          +    '</a>'
                          +    `<div class="conf-list-entry-profile">appid-${data.appid}</div>`
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


                    entriesHTMLString.push({ key1: appdata?.name, key2: data.appid, string: entryHTMLString });
                } else {
                    console.warn('SteamItemMatcher.configLoadUI(): HTML generation for a list not implemented, that list will be empty!');
                    break;
                }
            }

            if(listName === 'applist') {
                entriesHTMLString.sort((a, b) => !a.key1 ? a.key2-b.key2 : a.key1-b.key1);
            }

            entryGroupElem.insertAdjacentHTML('afterbegin', entriesHTMLString.reduce((str, entry) => str+entry.string, ''));
        }

        // set active tab
        if(globalSettings.matcherConfig.currentTab) {
            SteamItemMatcher.configSetListTab(globalSettings.matcherConfig.currentTab);
        }

        SteamItemMatcher.configResetEntryForm();

        SteamItemMatcher.setOverlay(SteamItemMatcher.configShortcuts.listContentsElem, false);
    },

    configSetEntryActionBar: function(actionBarName) {
        const validActions = ['add', 'modify'];
        let listActionElem = SteamItemMatcher.configShortcuts.listActionBarElem;
        if(validActions.includes(actionBarName)) {
            listActionElem.className = 'conf-list-entry-action ' + actionBarName;
        } else {
            console.warn('SteamItemMatcher.configSetEntryActionBar(): Action bar name not valid, nothing will change!');
        }
    },

    configSelectListTabListener: function(event) {
        console.log(event.target); // debugging
        if(!event.target.matches('.userscript-config-list-tab') || event.target.matches('.active')) {
            return;
        }
        SteamItemMatcher.configSetListTab(event.target.dataset.listName);
    },

    configSetListTab: function(tabName) {
        if(!Object.keys(globalSettings.matcherConfig.lists).includes(tabName)) {
            console.error('SteamItemMatcher.configSetListTab(): invalid tab name!');
            return;
        }

        SteamItemMatcher.configShortcuts.listTabListElem.querySelector(`.userscript-config-list-tab.active`)?.classList.remove('active');
        const target = SteamItemMatcher.configShortcuts.listTabListElem.querySelector(`.userscript-config-list-tab[data-list-name=${tabName}]`);
        target.classList.add('active');
        globalSettings.matcherConfig.currentTab = target.dataset.listName;
        SteamItemMatcher.setOverlay(SteamItemMatcher.configShortcuts.listContentsElem, false);

        if(SteamItemMatcher.configShortcuts.selectedListEntryElem) {
            SteamItemMatcher.configSelectListEntry(SteamItemMatcher.configShortcuts.selectedListEntryElem, true);
        }

        SteamItemMatcher.configResetEntryForm();
        SteamItemMatcher.configShowActiveList();
    },

    configResetEntryForm: function() {
        let currentTab = globalSettings.matcherConfig.currentTab;

        let entryFormElem = SteamItemMatcher.configShortcuts.listFormElem;
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
                console.warn('SteamItemMatcher.configResetEntryForm(): Tab reset not implemented, form will not be generated!');
                return;
            }

            let entryFormActionHTMLString = '<div class="userscript-dialog-container">'
              +    '<button id="dialog-form-cancel" class="userscript-btn red">Cancel</button>'
              +    '<button id="dialog-form-add" class="userscript-btn green">Add</button>'
              + '</div>';
            entryFormElem.insertAdjacentHTML('beforeend', entryFormActionHTMLString);
            document.getElementById('dialog-form-cancel').addEventListener('click', SteamItemMatcher.configEntryFormCancelListener);
            document.getElementById('dialog-form-add').addEventListener('click', SteamItemMatcher.configEntryFormAddListener);

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
                console.warn('SteamItemMatcher.configResetEntryForm(): Tab reset not implemented, form will not be generated!');
                return;
            }
        }
    },

    configShowActiveList: function() {
        let currentTab = globalSettings.matcherConfig.currentTab;
        for(let listGroup of Object.values(SteamItemMatcher.configShortcuts.listElems)) {
            if(currentTab !== listGroup.dataset.listName) {
                listGroup.classList.remove('active');
            } else {
                listGroup.classList.add('active');
            }
        }
    },

    configSelectListEntryListener: function(event) {
        console.log(event.target);
        let entryElem = event.target;
        while(!entryElem.matches('.userscript-config-list-entries')) {
            if(entryElem.matches('.userscript-config-list-entry')) {
                break;
            } else {
                entryElem = entryElem.parentElement;
            }
        }
        if(!entryElem.matches('.userscript-config-list-entry')) {
            return;
        }

        SteamItemMatcher.configSelectListEntry(entryElem);
    },

    configSelectListEntry: function(entryElem, toggle = true) {
        if(!entryElem.classList.contains('selected')) {
            if(SteamItemMatcher.configShortcuts.selectedListEntryElem) {
                SteamItemMatcher.configShortcuts.selectedListEntryElem.classList.remove('selected');
            }

            SteamItemMatcher.configShortcuts.selectedListEntryElem = entryElem;
            entryElem.classList.add('selected');
            SteamItemMatcher.configSetEntryActionBar('modify');
        } else if(toggle) {
            entryElem.classList.remove('selected');
            SteamItemMatcher.configShortcuts.selectedListEntryElem = undefined;

            SteamItemMatcher.configResetEntryForm();
            SteamItemMatcher.configSetEntryActionBar('add');
        }
    },

    configUpdateChecklistListener: function(event) {
        console.log(event.currentTarget); // debugging
        if(!event.target.matches('input')) {
            return;
        }
        let groupId = event.currentTarget.dataset.id;
        let optionId = event.target.id;

        for(let group of Object.values(globalSettings.matcherConfig.config)) {
            if(group.id === groupId) {
                group.options.find(x => x.id === optionId).value = event.target.checked;
                break;
            }
        }
    },

    // add new config list entry, populated input values persist when form is minimized
    configToggleEntryFormListener: function(event) {
        SteamItemMatcher.setOverlay(SteamItemMatcher.configShortcuts.listContentsElem, !SteamItemMatcher.configShortcuts.listContentsElem.matches('.overlay'), 'form');
    },

    // edit selected entry, prefilled with selected entry info
    configEditListEntryListener: function(event) {
        let currentTab = globalSettings.matcherConfig.currentTab;
        if(SteamItemMatcher.configShortcuts.listContentsElem.matches('.overlay') && SteamItemMatcher.configShortcuts.listContentsElem.querySelector('> .userscript-overlay')?.matches('.form')) {
            SteamItemMatcher.setOverlay(SteamItemMatcher.configShortcuts.listContentsElem, false);
            return;
        }

        if(!SteamItemMatcher.configShortcuts.selectedListEntryElem) {
            console.log('SteamItemMatcher.configEditListEntryListener(): No entry selected, nothing can be edited...');
            return;
        }

        if(currentTab === 'matchlist' || currentTab === 'blacklist') {
            SteamItemMatcher.configShortcuts.MAIN_ELEM.querySelector('#entry-form-id').value = SteamItemMatcher.configShortcuts.selectedListEntryElem.dataset.profileid;
            SteamItemMatcher.configShortcuts.MAIN_ELEM.querySelector('#entry-form-descript').value = SteamItemMatcher.configShortcuts.selectedListEntryElem.querySelector('.conf-list-entry-descript').textContent;
        } else if(currentTab === 'applist') {
            SteamItemMatcher.configShortcuts.MAIN_ELEM.querySelector('#entry-form-id').value = SteamItemMatcher.configShortcuts.selectedListEntryElem.dataset.appid;
            SteamItemMatcher.configShortcuts.MAIN_ELEM.querySelector('#entry-form-descript').value = SteamItemMatcher.configShortcuts.selectedListEntryElem.querySelector('.conf-list-entry-descript').textContent;
        } else {
            console.warn('SteamItemMatcher.configEditListEntryListener(): Entry edit prefill not implemented, form will not be prefilled!');
            return;
        }

        SteamItemMatcher.setOverlay(SteamItemMatcher.configShortcuts.listContentsElem, true, 'form');
    },

    // remove selected entry
    configDeleteListEntryListener: function(event) {
        if(!SteamItemMatcher.configShortcuts.selectedListEntryElem) {
            console.log('SteamItemMatcher.configDeleteListEntryListener(): No entry selected, nothing will be removed...');
            return;
        }
        let listGroup = SteamItemMatcher.configShortcuts.selectedListEntryElem.parentElement.dataset.listName;
        if(!globalSettings.matcherConfig.lists[listGroup]) {
            console.warn('SteamItemMatcher.configDeleteListEntryListener(): List not found, something is wrong!');
            return;
        }

        if(listGroup==='matchlist' || listGroup==='blacklist') {
            let profileid = SteamItemMatcher.configShortcuts.selectedListEntryElem.dataset.profileid;
            let selectedIndex = globalSettings.matcherConfig.lists[listGroup].data.findIndex(x => x.profileid === profileid);
            if(selectedIndex === -1) {
                console.warn('SteamItemMatcher.configDeleteListEntryListener(): Profileid not found, which means list and data are not synced!');
                return;
            }
            globalSettings.matcherConfig.lists[listGroup].data.splice(selectedIndex, 1);
            SteamItemMatcher.configShortcuts.selectedListEntryElem.remove();
            SteamItemMatcher.configShortcuts.selectedListEntryElem = undefined;
            SteamItemMatcher.configSetEntryActionBar('add');
        } else if(listGroup === 'applist') {
            let appid = SteamItemMatcher.configShortcuts.selectedListEntryElem.dataset.appid;
            let selectedIndex = globalSettings.matcherConfig.lists[listGroup].data.findIndex(x => x.appid === appid);
            if(selectedIndex === -1) {
                console.warn('SteamItemMatcher.configDeleteListEntryListener(): Appid not found, which means list and data are not synced!');
                return;
            }
            globalSettings.matcherConfig.lists[listGroup].data.splice(selectedIndex, 1);
            SteamItemMatcher.configShortcuts.selectedListEntryElem.remove();
            SteamItemMatcher.configShortcuts.selectedListEntryElem = undefined;
            SteamItemMatcher.configSetEntryActionBar('add');
        } else {
            console.warn('SteamItemMatcher.configDeleteListEntryListener(): List deletion not implemented, nothing will be changed!');
        }
    },

    configEntryFormAddListener: async function(event) {
        let currentTab = globalSettings.matcherConfig.currentTab;

        if(currentTab==='matchlist' || currentTab==='blacklist') {
            SteamItemMatcher.configShortcuts.listActionBarElem.classList.add('disabled');
            SteamItemMatcher.setOverlay(SteamItemMatcher.configShortcuts.listContentsElem, true, 'loading');

            const formElem = SteamItemMatcher.configShortcuts.listFormElem;
            let profileValue = formElem.querySelector('#entry-form-id').value;
            let description = formElem.querySelector('#entry-form-descript').value;
            let profileEntry;

            if(steamToolsUtils.isSteamId64Format(profileValue)) {
                profileEntry = globalSettings.matcherConfig.lists[currentTab].data.find(x => x.profileid === profileValue);
            }

            if(profileEntry) {
                // app found: prompt user if they want to overwrite existing data
                let selectedEntryElem = SteamItemMatcher.configShortcuts.listElems[currentTab].querySelector(`[data-profileid="${profileEntry.profileid}"]`);
                SteamItemMatcher.configShortcuts.entryEditOld = profileEntry;
                SteamItemMatcher.configShortcuts.entryEditNew = { descript: description };
                SteamItemMatcher.configSelectListEntry(selectedEntryElem, false);
                document.getElementById('conf-list-entry-old').innerHTML = selectedEntryElem.innerHTML;
                document.getElementById('conf-list-entry-new').innerHTML = selectedEntryElem.innerHTML;
                document.getElementById('conf-list-entry-new').querySelector('.conf-list-entry-descript').textContent = description;
                SteamItemMatcher.setOverlay(SteamItemMatcher.configShortcuts.listContentsElem, true, 'loading dialog');
                return;
            } else {
                let profile = await Profile.findProfile(profileValue);
                if(profile) {
                    profileEntry = globalSettings.matcherConfig.lists[currentTab].data.find(x => x.profileid === profile.id);
                    if(profileEntry) {
                        // app found: prompt user if they want to overwrite existing data
                        let selectedEntryElem = SteamItemMatcher.configShortcuts.listElems[currentTab].querySelector(`[data-profileid="${profileEntry.profileid}"]`);
                        SteamItemMatcher.configShortcuts.entryEditOld = profileEntry;
                        SteamItemMatcher.configShortcuts.entryEditNew = { descript: description };
                        SteamItemMatcher.configSelectListEntry(selectedEntryElem, false);
                        document.getElementById('conf-list-entry-old').innerHTML = selectedEntryElem.innerHTML;
                        document.getElementById('conf-list-entry-new').innerHTML = selectedEntryElem.innerHTML;
                        document.getElementById('conf-list-entry-new').querySelector('.conf-list-entry-descript').textContent = description;
                        SteamItemMatcher.setOverlay(SteamItemMatcher.configShortcuts.listContentsElem, true, 'loading dialog');
                        return;
                    } else {
                        let entryGroupElem = SteamItemMatcher.configShortcuts.listElems[currentTab];
                        let tradeTokenWarning = currentTab === 'blacklist' || Profile.me?.isFriend(profile) || profile.tradeToken;
                        let entryHTMLString = `<div class="userscript-config-list-entry${tradeTokenWarning ? '' : ' warn'}" data-profileid="${profile.id}" ${profile.url ? `data-url="${profile.url}"` : ''} data-name="${profile.name}">`
                          +    `<a href="https://steamcommunity.com/${profile.url ? `id/${profile.url}` : `profiles/${profile.id}`}/" target="_blank" rel="noopener noreferrer" class="avatar ${profile.getStateString()}">`
                          +       `<img src="https://avatars.akamai.steamstatic.com/${profile.pfp}.jpg" alt="">`
                          +    '</a>'
                          +    `<div class="conf-list-entry-name" title="${profile.name}" >${profile.name}</div>`
                          +    `<div class="conf-list-entry-descript">${description}</div>`
                          + '</div>';

                        entryGroupElem.insertAdjacentHTML('afterbegin', entryHTMLString);
                        globalSettings.matcherConfig.lists[currentTab].data.push({ profileid: profile.id, descript: description });
                    }
                } else {
                    alert('No valid profile found. Data will not be added!');
                }
            }

            SteamItemMatcher.setOverlay(SteamItemMatcher.configShortcuts.listContentsElem, false);
            SteamItemMatcher.configShortcuts.listActionBarElem.classList.remove('disabled');
        } else if(currentTab === 'applist') {
            SteamItemMatcher.configShortcuts.listActionBarElem.classList.add('disabled');
            SteamItemMatcher.setOverlay(SteamItemMatcher.configShortcuts.listContentsElem, true, 'loading');

            const formElem = SteamItemMatcher.configShortcuts.listFormElem;
            let appid = parseInt(formElem.querySelector('#entry-form-id').value);
            let description = formElem.querySelector('#entry-form-descript').value;
            let appidEntry = globalSettings.matcherConfig.lists[currentTab].data.find(x => x.appid === appid);

            if(appidEntry) {
                // app found: prompt user if they want to overwrite existing data
                let selectedEntryElem = SteamItemMatcher.configShortcuts.listElems[currentTab].querySelector(`.userscript-config-list-entry[data-appid="${appidEntry.appid}"]`);
                SteamItemMatcher.configShortcuts.entryEditOld = appidEntry;
                SteamItemMatcher.configShortcuts.entryEditNew = { descript: description };
                SteamItemMatcher.configSelectListEntry(selectedEntryElem, false);
                document.getElementById('conf-list-entry-old').innerHTML = selectedEntryElem.innerHTML;
                document.getElementById('conf-list-entry-new').innerHTML = selectedEntryElem.innerHTML;
                document.getElementById('conf-list-entry-new').querySelector('.conf-list-entry-descript').textContent = description;
                SteamItemMatcher.setOverlay(SteamItemMatcher.configShortcuts.listContentsElem, true, 'loading dialog');
                return;
            } else {
                let appdata = await Profile.findAppMetaData(appid);
                if(!appdata) {
                    // no appdata exists, could possibly mean that community data was nuked (eg 梦中女孩) even if the items still exist
                    // therefore don't reject entry submission and add entry
                    let entryHTMLString = `<div class="userscript-config-list-entry" data-appid="${appid}" data-name="">`
                      +    `<a class="app-header">`
                      +       `<img src="https://cdn.cloudflare.steamstatic.com/steam/apps/${appdata.appid}/header.jpg" alt="">`
                      +    '</a>'
                      +    `<div class="conf-list-entry-profile">${appid}</div>`
                      +    `<div class="conf-list-entry-descript">${description}</div>`
                      + '</div>';

                    SteamItemMatcher.configShortcuts.listElems[currentTab].insertAdjacentHTML('beforeend', entryHTMLString);
                    globalSettings.matcherConfig.lists[currentTab].data.push({ appid: appid, descript: description });
                } else {
                    let insertBeforeThisEntry;
                    for(let entryElem of SteamItemMatcher.configShortcuts.listElems[currentTab].querySelectorAll(`.userscript-config-list-entry`)) {
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

                    if(insertBeforeThisEntry) {
                        insertBeforeThisEntry.insertAdjacentHTML('beforebegin', entryHTMLString);
                    } else {
                        SteamItemMatcher.configShortcuts.listElems[currentTab].insertAdjacentHTML('afterbegin', entryHTMLString);
                    }
                    let entryIndex = globalSettings.matcherConfig.lists[currentTab].data.findIndex(x => x.appid === parseInt(insertBeforeThisEntry.dataset.appid));
                    globalSettings.matcherConfig.lists[currentTab].data.splice(entryIndex - 1, 0, { appid: appdata.appid, descript: description });
                }

                SteamItemMatcher.setOverlay(SteamItemMatcher.configShortcuts.listContentsElem, false);
                SteamItemMatcher.configShortcuts.listActionBarElem.classList.remove('disabled');
            }
        } else {
            console.warn('SteamItemMatcher.configEntryFormAddListener(): Tab entry submission not implemented, no entry modified/added!');
        }
    },

    configEntryFormCancelListener: function(event) {
        let currentTab = globalSettings.matcherConfig.currentTab;
        if(currentTab === 'matchlist' || currentTab === 'blacklist') {
            SteamItemMatcher.configShortcuts.listContainer.querySelector('#entry-form-id').value = '';
            SteamItemMatcher.configShortcuts.listContainer.querySelector('#entry-form-descript').value = '';
        } else if(currentTab === 'applist') {
            SteamItemMatcher.configShortcuts.listContainer.querySelector('#entry-form-id').value = '';
            SteamItemMatcher.configShortcuts.listContainer.querySelector('#entry-form-descript').value = '';
        } else {
            console.warn('SteamItemMatcher.configEntryFormCancelListener(): Entry form cancel not implemented, form will not be cleared!');
        }

        SteamItemMatcher.setOverlay(SteamItemMatcher.configShortcuts.listContentsElem, false);
    },

    configListDialogCancelListener: function(event) {
        SteamItemMatcher.setOverlay(SteamItemMatcher.configShortcuts.listContentsElem, true, 'form');
        document.getElementById('conf-list-entry-old').innerHTML = '';
        document.getElementById('conf-list-entry-new').innerHTML = '';
        SteamItemMatcher.configShortcuts.listActionBarElem.classList.remove('disabled');
        SteamItemMatcher.configShortcuts.entryEditOld = undefined;
        SteamItemMatcher.configShortcuts.entryEditNew = undefined;
    },

    configListDialogConfirmListener: function(event) {
        Object.assign(SteamItemMatcher.configShortcuts.entryEditOld, SteamItemMatcher.configShortcuts.entryEditNew);
        SteamItemMatcher.configShortcuts.selectedListEntryElem.innerHTML = document.getElementById('conf-list-entry-new').innerHTML;
        SteamItemMatcher.setOverlay(SteamItemMatcher.configShortcuts.listContentsElem, false);
        document.getElementById('conf-list-entry-old').innerHTML = '';
        document.getElementById('conf-list-entry-new').innerHTML = '';
        SteamItemMatcher.configShortcuts.listActionBarElem.classList.remove('disabled');
        SteamItemMatcher.configResetEntryForm();
        SteamItemMatcher.configShortcuts.entryEditOld = undefined;
        SteamItemMatcher.configShortcuts.entryEditNew = undefined;
    },

    configImportListener: async function() {
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
            throw 'SteamItemMatcher.configImportListener(): Invalid imported config!';
        }

        globalSettings.matcherConfig = importedConfig;
        SteamItemMatcher.configLoadUI();
    },

    configExportListener: async function() {
        exportConfig('matcher', 'SteamMatcherConfig');
    },

    configSaveListener: async function() {
        await SteamToolsDbManager.setToolConfig('matcherConfig');
    },

    configLoadListener: async function() {
        let config = await SteamToolsDbManager.getToolConfig('matcherConfig');
        if(config.matcherConfig) {
            globalSettings.matcherConfig = config.matcherConfig;
            SteamItemMatcher.configLoadUI();
        }
    },

    configResetDefaultListener: function() {
        let promptInput = prompt('WARNING: This will reset all config options back to default and all the lists will be earased. Proceed? (y/n)');
        if(promptInput.toLowerCase().startsWith('y')) {
            globalSettings.matcherConfig = steamToolsUtils.deepClone(SteamItemMatcher.SETTINGSDEFAULTS.matcherConfig);
            SteamItemMatcher.configLoadUI();
        }
    },

    configFullMatchListener: async function() {
        SteamItemMatcher.configShortcuts.listActionBarElem.classList.add('disabled');
        SteamItemMatcher.setOverlay(SteamItemMatcher.configShortcuts.listContentsElem, true, 'loading');

        let settings = globalSettings.matcherConfig.config;
        let blacklist = settings.ignoreGroup.options.find(x => x.name==='blacklist').value
          ? globalSettings.matcherConfig.lists.blacklist.data
          : [];
        let profileGroups = [];
        let asfBots; // save in iDB, include match priority ranking

        for(let matchGroup of settings.matchGroup.options) {
            if(!matchGroup.value) {
                continue;
            }

            let groupProfiles = { name: matchGroup.name, list: [] };
            profileGroups.push(groupProfiles);

            if(matchGroup.name === 'friends') {
                if(!Profile.me) {
                    await Profile.findProfile(steamToolsUtils.getMySteamId());
                }
                if(!Profile.me.friends || !Profile.me.friends.length) {
                    await Profile.me.getFriends();
                }
                for(let profileString of Profile.me.friends) {
                    groupProfiles.list.push(profileString.replace(/(id|profiles)\//g,''));
                }
            } else if(matchGroup.name === 'asfAny') {
                asfBots ??= await SteamItemMatcher.getASFProfiles();
                for(let botEntry of asfBots) {
                    if(!botEntry.matchAny) {
                        continue;
                    }

                    Profile.addTradeURL({ partner: botEntry.id, token: botEntry.tradeToken });
                    groupProfiles.list.push(botEntry.id);
                }
            } else if(matchGroup.name === 'asfFair') {
                asfBots ??= await SteamItemMatcher.getASFProfiles();
                for(let botEntry of asfBots) {
                    if(botEntry.matchAny) {
                        continue;
                    }

                    Profile.addTradeURL({ partner: botEntry.id, token: botEntry.tradeToken });
                    groupProfiles.list.push(botEntry.id);
                }
            } else if(matchGroup.name === 'custom') {
                for(let profileEntry of globalSettings.matcherConfig.lists.matchlist.data) {
                    groupProfiles.list.push(profileEntry.profileid);
                }
            } else {
                console.warn(`SteamItemMatcher.configFullMatchListener(): Match Group '${matchGroup.name}' profile list processing not implemented, skipped!`);
            }
        }

        SteamItemMatcher.shortcuts.data ??= {};
        SteamItemMatcher.shortcuts.data.matchProfileGroups = profileGroups;

        await SteamItemMatcher.startMatching();
    },

    configSingleMatchListener: async function() {
        SteamItemMatcher.configShortcuts.listActionBarElem.classList.add('disabled');
        SteamItemMatcher.setOverlay(SteamItemMatcher.configShortcuts.listContentsElem, true, 'loading');

        SteamItemMatcher.configShortcuts.matchSingleProfileProfileid.value = SteamItemMatcher.configShortcuts.matchSingleProfileProfileid.value.trim();
        let profile = await Profile.findProfile(SteamItemMatcher.configShortcuts.matchSingleProfileProfileid.value);
        if(!profile || (await profile.isMe())) {
            alert('Invalid profile!');
            SteamItemMatcher.setOverlay(SteamItemMatcher.configShortcuts.listContentsElem, false);
            SteamItemMatcher.configShortcuts.listActionBarElem.classList.remove('disabled');
            return;
        }

        if( !(await SteamItemMatcher.verifyConfigSave()) ) {
            return;
        }

        SteamItemMatcher.shortcuts.data ??= {};
        SteamItemMatcher.shortcuts.data.matchProfileGroups = [{ name: 'single', list: [profile.id] }];

        await SteamItemMatcher.startMatching();
    },

    verifyConfigSave: async function() {
        let savedConfig = await SteamToolsDbManager.getToolConfig('matcherConfig');
        if(JSON.stringify(globalSettings.matcherConfig) !== JSON.stringify(savedConfig.matcherConfig)) {
            let userPrompt = prompt('WARNING: Settings have not been saved! Save now? (y/n/cancel)');
            if(!userPrompt[0].localeCompare('y', 'en', { sensitivity: 'base' })) {
                await SteamToolsDbManager.setToolConfig('matcherConfig');
                console.log('SteamItemMatcher.configSingleMatchListener(): Saved Settings. Continuing to matching process...');
            } else if(!userPrompt[0].localeCompare('n', 'en', { sensitivity: 'base' })) {
                console.log('SteamItemMatcher.configSingleMatchListener(): Settings will not be saved. Continuing to matching process...');
            } else {
                if(!userPrompt[0].localeCompare('c', 'en', { sensitivity: 'base' })) {
                    console.log('SteamItemMatcher.configSingleMatchListener(): Cancelled. Matching will not continue...');
                } else {
                    console.log('matcherconfigsinglematchlistener(): invalid input. matching will not continue...');
                }
                SteamItemMatcher.setOverlay(SteamItemMatcher.configShortcuts.listContentsElem, false);
                SteamItemMatcher.configShortcuts.listActionBarElem.classList.remove('disabled');
                return false;
            }
        }

        return true;
    },

    startMatching: async function() {

        GM_addStyle(cssMatcher);

        console.warn('SteamItemMatcher.startMatching(): Not Implemented Yet!');
        // UI setup (remove tool supernav)
        Object.keys(SteamItemMatcher.configShortcuts).forEach(key => (key === 'MAIN_ELEM') || delete SteamItemMatcher.configShortcuts[key]);
        SteamItemMatcher.configShortcuts.MAIN_ELEM.innerHTML = '<div class="match-results">'
          + '</div>';

        SteamItemMatcher.shortcuts.results = SteamItemMatcher.configShortcuts.MAIN_ELEM.querySelector('.match-results');
        SteamItemMatcher.shortcuts.resultGroups = {};

        if(!Profile.me) {
            await Profile.findProfile(steamToolsUtils.getMySteamId());
        }

        for(let group of SteamItemMatcher.shortcuts.data.matchProfileGroups) {
            await SteamItemMatcher.matchProfileGroup(group);
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
    },

    matchProfileGroup: async function(matchGroup) {
        const generateMatchGroupString = (groupName) => `<div class="match-group" data-group="${groupName}"></div>`;

        if(!matchGroup.list.length) {
            return;
        }

        SteamItemMatcher.shortcuts.results.insertAdjacentHTML('beforeend', generateMatchGroupString(matchGroup.name));
        SteamItemMatcher.shortcuts.resultGroups[matchGroup.name] = SteamItemMatcher.shortcuts.results.querySelector(`[data-group="${matchGroup.name}"]`);

        for(let profileData of matchGroup.list) {
            let profile = (profileData instanceof Profile)
              ? profileData
              : (await Profile.findProfile(profileData));

            if(!profile) {
                console.warn(`SteamItemMatcher.startMatching(): Profile data ${profileData} is not valid!`);
            }

            await SteamItemMatcher.matchProfile(matchGroup.name, profile);
        }
    },

    matchProfile: async function(groupName, profile) {
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

        SteamItemMatcher.shortcuts.resultGroups[groupName].insertAdjacentHTML('beforeend', SteamItemMatcher.generateMatchProfileContainer(Profile.me, profile));
        let matchContainer = SteamItemMatcher.shortcuts.resultGroups[groupName].querySelector('.match-container-outer.loading > .match-container');
        let shortcuts = {};

        let matchResult = await Matcher.matchInv(Profile.me, profile);

        if(!matchResult || steamToolsUtils.isEmptyObject(matchResult.results)) {
            console.warn('SteamItemMatcher.matchProfile(): No results to be rendered!');
            matchContainer.parentElement.remove();
            return;
        }

        for(let result in matchResult.results) {
            let [itemType, rarity, appid] = result.split('_');

            shortcuts[itemType] ??= { elem: null, rarities: {} };
            if(!shortcuts[itemType].elem) {
                matchContainer.insertAdjacentHTML('beforeend', generateItemTypeContainerString(itemType));
                shortcuts[itemType].elem = matchContainer.querySelector(`[data-type="${itemType}"]`);
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

        matchContainer.parentElement.classList.remove('loading');
    },

    generateMatchProfileContainer: function(profile1, profile2) {
        const generateMatchNameHeaderString = (prof, reverseDirection = false) => {
            return `<div class="match-name${reverseDirection ? ' align-right' : ''}">`
              +    `<a href="https://steamcommunity.com/${prof.url ? `id/${prof.url}/` : `profiles/${prof.id}/`}" class="avatar ${prof.getStateString()}">`
              +       `<img src="https://avatars.akamai.steamstatic.com/${prof.pfp}.jpg" alt="">`
              +    '</a>'
              +    prof.name
              + '</div>'
        };
        const generateMatchContainerString = (prof1, prof2) => {
            return '<div class="match-container-outer loading">'
              +    `<div class="match-container grid" data-profileid1="${prof1.id}" data-profileid2="${prof2.id}">`
              +       '<div class="match-header">'
              +          generateMatchNameHeaderString(prof1, true)
              +          '<div class="match-item-action trade"></div>'
              +          generateMatchNameHeaderString(prof2)
              +       '</div>'
              +    '</div>'
              +    cssAddOverlay(cssAddThrobber())
              + '</div>'
        };

        return generateMatchContainerString(profile1, profile2);
    },

    setOverlay: function(overlayParentElem, overlayEnable, overlayState) {
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
                        console.warn('SteamItemMatcher.setOverlay(): Multiple overlay elements detected on same parent!');
                    }
                    overlayElem = childElem;
                }
            }

            if(!overlayElem) {
                console.warn('SteamItemMatcher.setOverlay(): No overlay element found in immediate children!');
                return;
            }

            overlayElem.className = 'userscript-overlay ' + overlayState;
        }
    },

    getASFProfiles: async function() {
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
                        resolveError('SteamItemMatcher.getASFProfiles(): Status code ' + response.status);
                    }

                    // NOTE: avoid using 'SteamID' property (always exceeds MAX_SAFE_INTEGER, therefore incorrect value)
                    let datalist = JSON.parse(response.response);
                    if(!datalist.Success) {
                        resolveError('SteamItemMatcher.getASFProfiles(): Response object not successful!');
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
                    resolveError('SteamItemMatcher.getASFProfiles(): Error requesting ASF profiles!');
                },
                onabort(response) {
                    resolveError('SteamItemMatcher.getASFProfiles(): Aborted!');
                },
                ontimeout(response) {
                    resolveError('SteamItemMatcher.getASFProfiles(): Request timeout!');
                }
            });
        });

        return result;
    }
};
