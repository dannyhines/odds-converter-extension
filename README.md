# American Odds to Implied Probability Chrome Extension

View it on the Chrome Web Store: https://chrome.google.com/webstore/detail/odds-to-probability-text/nofjpbibnnkinmfndoknlbkchbecgbkb

This is a simple extension used to display the implied probability whenever American odds appear on your webpage. The project is incredibly lightweight (about ~20 lines of code) and only scans for text after the page has loaded.

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
