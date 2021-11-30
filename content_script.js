// Replacer function that takes in "+140", "-350", etc.
// Returns the replacement string eg. "+140 (41.7%)"
function replacer(match) {
  const num = parseInt(match.slice(1, match.length));
  let replacement = "";
  if (match[0] === "-") {
    replacement = ((num / (num + 100)) * 100).toFixed(1);
  } else {
    replacement = ((100 / (num + 100)) * 100).toFixed(1);
  }
  return match + " (" + replacement + "%)";
}

function textNodeInnerHTML(textNode, active) {
  let regex = active ? /([+-])(\d\d\d+)/g : / \(\d*\.\d\%\)/g;

  var div = document.createElement("div");
  textNode.parentNode.insertBefore(div, textNode);
  div.insertAdjacentHTML(
    "afterend",
    textNode.data.replace(regex, active ? replacer : "")
  );
  div.remove();
  textNode.remove();
}

function replaceAllText(active) {
  // Replace every text element on the page
  let body = document.getElementsByTagName("body")[0];
  let textNodes = [...body.querySelectorAll("*")]
    .map((l) => [...l.childNodes])
    .flat()
    .filter((l) => l.nodeType === 3);

  for (let i = 0; i < textNodes.length; i++) {
    textNodeInnerHTML(textNodes[i], active);
  }
}

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  const activate = request.action === "activate";
  replaceAllText(activate);
  sendResponse({ isActive: activate });
  return true;
});

function onPageLoaded() {
  chrome.storage.sync.get(["isActive"], function (result) {
    if (result && result.isActive) {
      replaceAllText(true);
    }
  });
}

if (document.readyState === "complete") {
  document.addEventListener("load", onPageLoaded);
} else {
  onPageLoaded();
}
