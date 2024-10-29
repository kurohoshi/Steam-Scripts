const globalSettings = {};
const TOOLS_MENU = [];
const DB_OBJECTSTORE_CONFIGS = [
    { name: 'config', keypath: undefined, autoincr: undefined },
    { name: 'profiles', keypath: undefined, autoincr: undefined, indices: [
        { name: 'url', keyPath: 'url', options: undefined }
    ]},
    { name: 'badgepages', keypath: undefined, autoincr: undefined },
    { name: 'app_data', keypath: undefined, autoincr: undefined },
    { name: 'item_descripts', keypath: undefined, autoincr: undefined },
    { name: 'inventories', keypath: undefined, autoincr: undefined },
    { name: 'item_matcher_results', keypath: undefined, autoincr: undefined },
    { name: 'item_nameids', keypath: undefined, autoincr: undefined }
];

const MONTHS_ARRAY = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
