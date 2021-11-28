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

function replaceAllText(active) {
  const text = document.querySelectorAll(
    "h1, h2, h3, h4, h5, p, li, td, caption, span, a, div"
  );
  // Replace every text element on the page
  for (let i = 0; i < text.length; i++) {
    let regex = active ? /([+-])(\d\d\d+)/g : / \(\d*\.\d\%\)/g;
    text[i].innerHTML = text[i].innerHTML.replace(
      regex,
      active ? replacer : ""
    );
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

// Wait for the DOM to fully load before changing text

const delayedLoad = () => setTimeout(onPageLoaded, 1000);

if (document.readyState === "complete") {
  console.log("not complete");
  document.addEventListener("load", delayedLoad);
} else {
  delayedLoad();
}
