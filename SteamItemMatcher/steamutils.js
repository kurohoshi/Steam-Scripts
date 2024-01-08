var steamToolsUtils = {
   INV_FETCH_DELAY1: 5*1000, // for trade offer window or own inv
   INV_FETCH_DELAY2: 60*1000, // for others' regular inv
   FETCH_DELAY: 1000,
   sleep: function(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
   },
   getSessionId: function() {
      // return window.g_sessionID;
      return 'session'
   },
   getMySteamId: function() {
      // return window.g_steamID;
      return 'id'
   },
   getSteamProfileId64: function(steamid3) {
      // return '76561'+(parseInt(steamid3)+197960265728);
      return '123';
   },
   getSteamProfileId3: function(steamid64) {
      // return String(parseInt(steamid64.substring(5))-197960265728);
      return '321';
   }
};
