const text = document.querySelectorAll(
  "h1, h2, h3, h4, h5, p, li, td, caption, span, a, div"
);

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

// Replace every text element using the replacer function
for (let i = 0; i < text.length; i++) {
  let regex = /([+-])(\d\d\d+)/g;
  text[i].innerHTML = text[i].innerHTML.replace(regex, replacer);
}
