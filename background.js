// When the icon is clicked
// Checks 'isActive' from local storage, sends a msg to the content script, changes icon badge
chrome.action.onClicked.addListener((tab) => {
  chrome.storage.sync.get(["isActive"], function (result) {
    const action = result.isActive ? "deactivate" : "activate";
    chrome.tabs.sendMessage(tab.id, { action }, function (response) {
      if (response) {
        const active = response ? response.isActive : false;
        chrome.action.setBadgeText({
          text: active ? "ON" : "OFF",
          tabId: tab.id,
        });
        chrome.action.setBadgeBackgroundColor({
          color: active ? "#b4eeb4" : "#c22027",
          tabId: tab.id,
        });
        chrome.storage.sync.set({ isActive: active });
      }
    });
  });
});
