chrome.extension.onRequest.addListener(function(request, sender, sendResponse) {
	if (request.type == 'require_verifier') {
		var tabId = sender.tab.id;
		localStorage.setItem("require_verifier_tabid", tabId);
	}
	if (request.type == 'set_edam') {
		localStorage.removeItem("oauth_token");
		localStorage.removeItem("oauth_token_secret");
		localStorage.removeItem("oauth_verifier");

		localStorage.setItem("token", request.data.oauth_token);
		localStorage.setItem("noteStoreUrl", request.data.edam_noteStoreUrl);
	}
	if (request.type == 'set_edam' || request.type == 'get_edam') {
		sendResponse({
			token: localStorage.getItem('token'),
			noteStoreUrl: localStorage.getItem('noteStoreUrl'),
		});
	}
	if (request.type == "set_default_notebook") {
		localStorage.setItem("default_notebook_guid", request.guid);
	}
	if (request.type == "get_default_notebook") {
		sendResponse({
			guid: localStorage.getItem('default_notebook_guid') || "",
		});
	}
});