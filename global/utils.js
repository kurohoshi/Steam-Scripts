const steamToolsUtils = {
    INV_FETCH_DELAY1: 3*1000, // for trade offer window or own inv
    INV_FETCH_DELAY2: 60*1000, // for others' regular inv
    FETCH_DELAY: 1000,
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },
    deepClone(obj) {
        // Consider structuredClone()?
        // or something custom for performance?
        return JSON.parse(JSON.stringify(obj));
    },
    getSessionId() {
        return unsafeWindow.g_sessionID;
    },
    getMySteamId() {
        return unsafeWindow.g_steamID;
    },
    isSteamId64Format(str) {
        return /76561\d{12}/.test(str);
    },
    getSteamProfileId64(steamid3) {
        return '76561'+(parseInt(steamid3)+197960265728);
    },
    getSteamProfileId3(steamid64) {
        return String(parseInt(steamid64.substring(5))-197960265728);
    },
    getSteamLanguage() {
        return unsafeWindow.g_strLanguage;
    },
    isSimplyObject(obj) {
        return typeof obj==='object' && !Array.isArray(obj) && obj!==null;
    },
    isEmptyObject(obj) {
        for(let x in obj) {
            if(Object.hasOwn(obj, x)) {
                return false;
            }
        } return true;
    },
    clamp(num, min, max) {
        return Math.min(Math.max(num, min), max);
    },
    bitLength(num) {
        return num.toString(2).length;
    },
    isOutdatedDays(epochTime, days) {
        return epochTime < Date.now()-days*24*60*60*1000;
    },
    isOutdatedHours(epochTime, hours) {
        return epochTime < Date.now()-hours*60*60*1000;
    },
    generateExportDataElement(name, filename, data) {
        if(!data) {
            console.warn('exportConfig(): config not found, no configurations to be exported!');
            return;
        }

        let tmpElem = document.createElement('a');
        tmpElem.setAttribute('id', 'export-'+name);
        tmpElem.setAttribute('href', 'data:application/json;charset=utf-8,'+ encodeURIComponent(JSON.stringify(data)));
        tmpElem.setAttribute('download', filename+'.json');
        return tmpElem;
    },
    generateImportDataElement(name) {
        let tmpElem = document.createElement('input');
        tmpElem.setAttribute('id', 'import-'+name);
        tmpElem.setAttribute('type', 'file');
        tmpElem.setAttribute('accept', 'application/json');
        return tmpElem;
    },
    debounceFunction(func, delay) {
        let timeoutId = null;
        return (...args) => {
            unsafeWindow.clearTimeout(timeoutId);
            timeoutId = unsafeWindow.setTimeout(() => {
                func(...args);
            }, delay);
        };
    },
    createFetchQueue(urlList, maxFetches = 3, processData) {
        // https://krasimirtsonev.com/blog/article/implementing-an-async-queue-in-23-lines-of-code

        const controller = new AbortController();
        const { signal } = controller;
        let cancelled = false;

        let numFetches = 0;
        let urlIndex = 0;
        let results = Array(urlList.length).fill(null);

        return new Promise(done => {
            const handleResponse = index => (response) => {
                if(response.status !== 200) {
                    results[index] = null;
                    throw response;
                }
                return response.json();
            };

            const handleData = index => (result) => {
                results[index] = processData ? processData(result, urlList[index]?.optionalInfo) : result;
                numFetches--;
                getNextFetch();
            };

            const handleError = (error) => {
                if(error?.status === 429) {
                    console.error('createFetchQueue(): Too many requests...');
                    cancelled = true;
                    controller.abort();
                } else {
                    console.log(error);
                }
            };

            const getNextFetch = () => {
                if(cancelled) {
                    done(results);
                    return;
                }

                if(numFetches<maxFetches && urlIndex<urlList.length) {
                    fetch(urlList[urlIndex].url, { signal })
                      .then(handleResponse(urlIndex))
                      .then(handleData(urlIndex))
                      .catch(handleError);
                    numFetches++;
                    urlIndex++;
                    getNextFetch();
                } else if(numFetches === 0 && urlIndex === urlList.length) {
                    done(results);
                }
            };

            getNextFetch();
        });
    }
};

