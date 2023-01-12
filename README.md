# American Odds to Implied Probability Chrome Extension

![Chrome Web Store](https://img.shields.io/chrome-web-store/stars/nofjpbibnnkinmfndoknlbkchbecgbkb)
![GitHub repo size](https://img.shields.io/github/repo-size/danielchines/odds-converter-extension)
![GitHub issues](https://img.shields.io/github/issues/danielchines/odds-converter-extension)
![GitHub](https://img.shields.io/github/license/danielchines/odds-converter-extension)

View it on the Chrome Web Store: https://chrome.google.com/webstore/detail/odds-to-probability-text/nofjpbibnnkinmfndoknlbkchbecgbkb

This is a simple, lightweight Chrome extension that scans the webpage for instances of American odds (-130, +140, etc), and converts it to implied probability as a percentage. Click the extension icon to toggle it on and off.

## Example

Here are betting odds for a random NBA game:
![odds example](https://github.com/danielchines/odds-converter-extension/blob/main/images/screenshots/screenshot-before.png?raw=true)

Here's what appears after clicking on the extension:
![odds with probability displayed](https://github.com/danielchines/odds-converter-extension/blob/main/images/screenshots/screenshot-after.png?raw=true)

## Why?

Assuming the odds are "fair", the implied probability is the percentage chance that the bet is supposed to win. Because sportsbooks charge a fee or "vig" for placing bets, this number will appear slightly higher than the actual probability. This number is simpler way to look at sports betting: a "good bet" is one where you believe the percentage chance is higher than the implied probability.

## Building the project

Run the following command which will create a .zip including all the necessary files:

```
zip -r build.zip images/ background.js content_script.js manifest.json
```

And you're ready to upload your extension! To make your own extension you'll need to register as a [Chrome Web Store Developer](https://developer.chrome.com/docs/webstore/register/).
