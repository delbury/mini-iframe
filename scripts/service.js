const globalConfig = {
  iframeUrls: [],
  iframeScale: 0.5,
  opacity: 1,
};

// events
chrome.runtime.onMessage.addListener(({ type, payload }, sender, sendResp) => {
  if (type === "getGlobalData") {
    chrome.storage.local.get(payload ? [payload] : Object.keys(globalConfig)).then((res) => {
      sendResp(
        payload
          ? { [payload]: globalConfig[payload], ...res }
          : {
              ...globalConfig,
              ...res,
            }
      );
    });
  } else if (type === "setGlobalData") {
    chrome.storage.local.set(payload).then(() => {
      sendResp({
        done: true,
      });
    });
  }

  return true;
});

// modify response headers
// chrome.webRequest.onHeadersReceived.addListener(
//   (details) => {
//     console.log(details);
//   },
//   { urls: ["<all_urls>"] },
//   ["responseHeaders", "extraHeaders", "blocking"]
// );

console.log("mini iframe service started");
