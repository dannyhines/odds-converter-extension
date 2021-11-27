chrome.action.onClicked.addListener((tab) => {
  chrome.storage.sync.get(["isActive"], function (result) {
    const action = result.isActive ? "deactivate" : "activate";
    chrome.tabs.sendMessage(tab.id, { action }, function (response) {
      if (response) {
        const active = response ? response.isActive : false;
        chrome.action.setBadgeText({ text: active ? "ON" : "OFF" });
        chrome.action.setBadgeBackgroundColor({
          color: active ? "#b4eeb4" : "#c22027",
        });
        chrome.storage.sync.set({ isActive: active });
      }
    });
  });
});
