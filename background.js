if (localStorage.getItem('token') !== null && localStorage.getItem('noteStoreUrl') !== null) {
	chrome.storage.sync.set({
		"token": localStorage.getItem('token'),
		"noteStoreUrl": localStorage.getItem('noteStoreUrl')
	}, function() {
		console.log("Upgraded extension!\nNow token are syncing with every devices if login same Google account.");
		localStorage.removeItem('token');
		localStorage.removeItem('noteStoreUrl');
	});
}

chrome.storage.sync.get(["token", "noteStoreUrl"], function(items) {
	if (items.token == "undefined" || items.noteStoreUrl == "undefined") {
		chrome.storage.sync.remove(["token", "noteStoreUrl"], function() {
			console.error("token error, cleared.");
		});
	}
});

chrome.extension.onRequest.addListener(function(request, sender, sendResponse) {
	if (request.type == 'require_verifier') {
		var tabId = sender.tab.id;
		localStorage.setItem("require_verifier_tabid", tabId);
	}
	if (request.type == 'set_edam') {
		localStorage.removeItem("oauth_token");
		localStorage.removeItem("oauth_token_secret");
		localStorage.removeItem("oauth_verifier");

		chrome.storage.sync.set({
			"token": request.data.oauth_token,
			"noteStoreUrl": request.data.edam_noteStoreUrl
		}, function() {
			console.log("token saved.");
			chrome.storage.sync.get(["token", "noteStoreUrl"], function(items) {
				sendResponse(items);
			});
		});
	}
	if (request.type == 'get_edam') {
		chrome.storage.sync.get(["token", "noteStoreUrl"], function(items) {
			sendResponse(items);
		});
	}
	if (request.type == "set_default_notebook") {
		localStorage.setItem("default_notebook_guid", request.guid);
	}
	if (request.type == "get_default_notebook") {
		sendResponse({
			guid: localStorage.getItem('default_notebook_guid'),
		});
	}
});