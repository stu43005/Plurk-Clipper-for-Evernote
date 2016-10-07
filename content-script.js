var app = {
	oauth: null,
	oauth_token_secret: '',

	token: null,
	noteStoreUrl: null,

	init: function() {
		if ($("body").hasClass("timeline")) {
			// 河道
			$("#timeline_holder").on("mouseover", ".plurk", function() {
				if ($(".manager .action.clip", this).length > 0) return false;

				var pid = $(this).data("pid");
				$(".manager", this).prepend(app.getClipButton(pid));

				app.localScript(function() {
					AddHoverToolTip(jQuery(".manager .action.clip").get(0), "Clip to Evernote");
				});
			});
		}

		if ($("body").hasClass("permaplurk")) {
			// 單噗頁面
			var pid = $(".bigplurk").data("pid");
			$(".bigplurk .controls").append($("<span/>", {
				id: "clip_plurk",
				"class": "s_False",
				html: app.getClipButton(pid)
			}));

			app.localScript(function() {
				AddHoverToolTip(jQuery("#clip_plurk").get(0), "Clip to Evernote");
			});
		}
	},

	getClipButton: function(pid) {
		return $("<a/>", {
			"class": "action clip do",
			href: "#",
			html: '<img src="' + chrome.extension.getURL("images/web-clipper-16x16.png") + '" alt="Clip to Evernote"/>',
			click: function() {
				app.showClipWindow(pid);
				return false;
			}
		});
	},

	showClipWindow: function(pid) {
		app.getNoteStore().then(function(noteStore) {
			noteStore.listNotebooks(app.token, function(notebooks) {
					console.log(notebooks);
				},
				function onerror(error) {
					console.log(error);
				});

			var wid = app.createGbWindow("Clip Plurk");
		});
	},

	getNoteStore: function() {
		return app.checkLogin().then(function() {
			var noteStoreTransport = new Thrift.BinaryHttpTransport(app.noteStoreUrl);
			var noteStoreProtocol = new Thrift.BinaryProtocol(noteStoreTransport);
			var noteStore = new NoteStoreClient(noteStoreProtocol);
			return noteStore;
		}, function(e) {
			console.error(e);
		});
	},

	checkLogin: function() {
		if (app.token !== null && app.noteStoreUrl !== null) {
			return Promise.resolve();
		}
		return new Promise(function(resolve, reject) {
			chrome.extension.sendRequest({
				type: 'get_edam'
			}, function(response) {
				app.token = response.token;
				app.noteStoreUrl = response.noteStoreUrl;

				if (app.token !== null && app.noteStoreUrl !== null) {
					resolve();
				} else {
					reject('no login');
					if (app.oauth === null) {
						app.loginWithEvernote();
					}
				}
			});
		});
	},

	loginWithEvernote: function() {
		var options = {
			consumerKey: config.consumerKey,
			consumerSecret: config.consumerSecret,
			//callbackUrl: "gotOAuth.html",
			callbackUrl: chrome.extension.getURL("gotOAuth.html"),
			signatureMethod: "HMAC-SHA1",
		};
		app.oauth = OAuth(options);
		// OAuth Step 1: Get request token
		app.oauth.request({
			'method': 'GET',
			'url': config.evernoteHostName + '/oauth',
			'success': app.success,
			'failure': app.failure
		});
	},

	success: function(data) {
		var isCallBackConfirmed = false;
		var token = '';

		var query = app.getQueryParams(data.text);
		// console.debug(query);
		if (typeof query.oauth_token != "undefined") {
			token = query.oauth_token;
		}
		if (typeof query.oauth_token_secret != "undefined") {
			app.oauth_token_secret = query.oauth_token_secret;
		}
		if (typeof query.oauth_callback_confirmed != "undefined") {
			isCallBackConfirmed = true;
		}

		if (isCallBackConfirmed) {
			// step 2
			window.open(config.evernoteHostName + '/OAuth.action?oauth_token=' + token, 'Evernote_OAuth', '_blank');

			chrome.runtime.onMessage.addListener(app.onGotOAuth);
			chrome.extension.sendRequest({
				type: 'require_verifier'
			}, function(response) {});

		} else {
			// Step 4 : Get the final token
			chrome.extension.sendRequest({
				type: 'set_edam',
				data: query
			}, function(response) {
				app.token = response.token;
				app.noteStoreUrl = response.noteStoreUrl;
			});
		}
	},

	failure: function(error) {
		console.error('error ' + error.text);
	},

	onGotOAuth: function(message, sender, sendResponse) {
		if (message.type == "got_oauth") {
			chrome.runtime.onMessage.removeListener(app.onGotOAuth);

			// step 3
			app.oauth.setVerifier(message.oauth_verifier);
			app.oauth.setAccessToken([message.oauth_token, app.oauth_token_secret]);

			app.oauth.request({
				'method': 'GET',
				'url': config.evernoteHostName + '/oauth',
				'success': app.success,
				'failure': app.failure
			});
		}
	},

	makeNote: function(noteStore, noteTitle, noteBody, parentNotebook, callback) {
		var nBody = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>";
		nBody += "<!DOCTYPE en-note SYSTEM \"http://xml.evernote.com/pub/enml2.dtd\">";
		nBody += "<en-note>" + noteBody + "</en-note>";

		// Create note object
		var newNote = new Evernote.Note();
		newNote.title = noteTitle;
		newNote.content = nBody;

		// parentNotebook is optional; if omitted, default notebook is used
		if (parentNotebook && parentNotebook.guid) {
			newNote.notebookGuid = parentNotebook.guid;
		}

		// Attempt to create note in Evernote account
		noteStore.createNote(app.token, newNote, function(err, note) {
			if (err) {
				// Something was wrong with the note data
				// See EDAMErrorCode enumeration for error code explanation
				// http://dev.evernote.com/documentation/reference/Errors.html#Enum_EDAMErrorCode
				console.log(err);
			} else {
				callback(note);
			}
		});

	},

	createGbWindow: function(title, html, w, h) {
		var id = '__GB_window__' + (new Date()).getTime();
		html = '<div id="' + id + '">' + (html || '') + '</div>';
		w = w || 500;
		h = h || 500;
		app.localScript(function(args) {
			var a = jQuery(args.html);
			top.GB_showHTML(args.title, a[0], args.w, args.h);
		}, {
			title,
			html,
			w,
			h
		});
		return id;
	},

	getQueryParams: function(query) {
		if (query.charAt(0) !== "?") query = "?" + query;
		return purl(query).param();
	},

	/**
	 * 執行本地腳本
	 * @param  {Function} func     函數
	 * @param  {object}   args     參數
	 */
	localScript: function(func, args, getReturn) {
		var id = '__localScript__' + (new Date()).getTime();
		var jsonArgs = JSON.stringify(args);
		var scriptText = 'window["' + id + '"] = (' + func + ')(' + jsonArgs + ');';

		var script = document.createElement('script');
		script.type = 'text/javascript';
		script.appendChild(document.createTextNode(scriptText));
		document.body.appendChild(script);

		setTimeout(function() {
			script.parentNode.removeChild(script);
		}, 1000);

		if (getReturn) return app.getGlobalVariable(id);
		else Promise.resolve();
	},

	/**
	 * 取得全域變數
	 * @param  {string}   variable 變數名稱
	 */
	getGlobalVariable: function(variable) {
		var id = '__getGlobalVariable__' + (new Date()).getTime();
		app.localScript(function(args) {
			function getValue(obj, variable) {
				var value = obj[variable[0]];
				if (variable.length > 1) return getValue(value, variable.slice(1));
				return value;
			}
			var text = JSON.stringify(getValue(window, args.variable.split(".")));
			var div = document.createElement('div');
			div.id = args.id;
			div.style.display = 'none';
			div.appendChild(document.createTextNode(text));
			document.body.appendChild(div);
		}, {
			variable: variable,
			id: id
		});

		return new Promise(function(resolve, reject) {
			function retrive() {
				var div = document.getElementById(id);
				if (div) {
					try {
						var value = JSON.parse(div.firstChild.nodeValue);
						resolve(value);
					} catch (e) {
						reject(e);
					}
					div.parentNode.removeChild(div);
				} else {
					setTimeout(retrive, 500);
				}
			}
			setTimeout(retrive, 500);
		});
	},

};
app.init();