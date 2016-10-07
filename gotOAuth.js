var query = purl(location.href).param();

var tabId = localStorage.getItem("require_verifier_tabid");
if (tabId !== null) {
	chrome.tabs.sendMessage(parseInt(tabId), {
		type: "got_oauth",
		oauth_token: query.oauth_token,
		oauth_verifier: query.oauth_verifier
	});
	localStorage.removeItem("require_verifier_tabid");
}

window.close();