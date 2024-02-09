const SteamToolsDbManager = {
   db: undefined,
   setup: function() {
      return new Promise((resolve, reject) => {
         if(this.db) {
            resolve();
            return;
         }

         const toolsdb = indexedDB.open("SteamTools", 1);

         toolsdb.onblocked = event => {
            alert("New Steam Tools database version detected, please close all tabs of this site!");
         }
         
         toolsdb.onupgradeneeded = event => {
            this.db = event.target.result;

            if(event.oldVersion === 0) {
               // NOTE: not keys/indices, we create our own key on add(), then create our own keyrange later
               this.db.createObjectStore("profiles");
               this.db.createObjectStore("badgepages");
               this.db.createObjectStore("app_data");
               this.db.createObjectStore("item_descripts");
               this.db.createObjectStore("inventories");
               this.db.createObjectStore("item_matcher_results");
            }
         }
         
         toolsdb.onsuccess = event => {
            this.db = event.target.result;
            this.db.onversionchange = event => {
               this.db = this.db.close();
               console.log("A new version of this page is ready. Please reload or close this tab!");
            }
            console.log("Database is set up!");
            resolve();
         }
         
         toolsdb.onerror = event => {
            reject("Error opening database. Error code: " + event.target.errorCode);
         }
      });
   },
   getProfile: function(profileid) {
      // start transaction, access objectStore, grab value stored in profileid key, return a promise
      return new Promise((resolve, reject) => {

      });
   },
   setProfile: function(profile) {
      // start transaction, access objectStore, store profile data, badgepages, and inventory with profileid as key, return a promise
      return new Promise((resolve, reject) => {

      });
   },
   setProfileAll: function() {
      // start transaction, access objectStore, store all profiles from the master profile list, return a promise
      return new Promise((resolve, reject) => {

      });
   },
   getBadgepages: function(profileid) {
      // start transaction, access objectStore, grab value stored in profileid key, return a promise
      return new Promise((resolve, reject) => {

      });
   },
   setBadgepages: function(profile) {
      // start transaction, access objectStore, store value with profileid as key, return a promise
      return new Promise((resolve, reject) => {

      });
   },
   getAppData: function(appid) {
      // start transaction, access objectStore, grab value with appid as key, return a promise
      return new Promise((resolve, reject) => {

      });
   },
   setAppData: function(appid) {
      // start transaction, access objectStore, store value with profileid as key, return a promise
      return new Promise((resolve, reject) => {

      });
   },
   getItemDescripts: function(appid, contextid, classid) {
      // start transaction, access objectStore, grab value with appid_contextid_classid as key, return a promise
      return new Promise((resolve, reject) => {

      });
   },
   setItemDescripts: function(item) {
      // start transaction, access objectStore, store value with appid_contextid_classid as key, return a promise
      return new Promise((resolve, reject) => {

      });
   },
   getProfileInventory: function(profileid, appid, contextid) {
      // start transaction, access objectStore, grab value with profileid_appid_contextid as key, return a promise
      return new Promise((resolve, reject) => {

      });
   },
   setProfileInventory: function(profile) {
      // start transaction, access objectStore, store value with profileid_appid_contextid as key, return a promise
      return new Promise((resolve, reject) => {

      });
   },
   getMatchResult: function(profileid1, profileid2) {
      // start transaction, access objectStore, grab value with profileid1_profileid2 as key, return a promise
      return new Promise((resolve, reject) => {

      });
   },
   setMatchResult: function(result) {
      // start transaction, access objectStore, store value with profileid1_profileid2 as key, return a promise
      return new Promise((resolve, reject) => {

      });
   },
}
