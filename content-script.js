var app = {
	oauth: null,
	oauth_token_secret: '',

	token: null,
	noteStoreUrl: null,

	init: function() {
		// check Timeline
		localScript(function() {
			return typeof PlurkTimeline;
		}).then(function(type) {
			if (type != "undefined") {
				app._init();
			}
		});
	},

	_init: function() {
		if ($("body").hasClass("timeline")) {
			// 河道
			$("#timeline_holder").on("mouseover", ".plurk", function() {
				if ($(".manager .action.clip", this).length > 0) return false;

				var pid = $(this).data("pid");
				$(".manager", this).prepend(app.getClipButton(pid));

				localScript(function() {
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
				html: app.getClipButton(pid).append("Clip to Evernote")
			}));
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
		return app.createPopWindow({
			width: 700
		}).then(function(pop) {
			return pop.show();
		}).then(function(pop) {
			return app.getTmpl("clip_template.html").then(function(html) {
				$("#" + pop.id).append(html);
				return pop;
			});
		}).then(function(pop) {
			return app.getNoteStore().then(function(noteStore) {
				return new Clip(pid, pop, noteStore, app.token);
			}).catch(function(e) {
				console.error(e);
				if (e == "no login") {
					$("#" + pop.id + " .pop-window-loading .no-login").show();
				} else {
					$("#" + pop.id + " .pop-window-loading .reload-require").show();
				}
			});
		});
	},

	getNoteStore: function() {
		return app.checkLogin().then(function() {
			var noteStoreTransport = new Thrift.BinaryHttpTransport(app.noteStoreUrl);
			var noteStoreProtocol = new Thrift.BinaryProtocol(noteStoreTransport);
			var noteStore = new NoteStoreClient(noteStoreProtocol);
			return noteStore;
		}).then(function(noteStore) {
			return new Promise(function (resolve, reject) {
				noteStore.listNotebooks(app.token, function (notebooks) {
					resolve(noteStore);
				}, function (error) {
					reject(error);
				})
			});
		}).catch(function() {
			app.token = null;
			app.noteStoreUrl = null;
			chrome.extension.sendRequest({
				type: 'set_edam',
				data: {
					oauth_token: null,
					edam_noteStoreUrl: null,
				}
			}, function (response) {});
			app.loginWithEvernote();
			return Promise.reject('no login');
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

	createPopWindow: function(options) {
		options.id = '__pop_window__' + (new Date()).getTime();
		options.content = '<div id="' + options.id + '">' + (options.content || '') + '</div>';
		return localScript(function(options) {
			function trigger(name) {
				return document.dispatchEvent(new CustomEvent(name));
			}
			options.onShow = function() {
				trigger(options.id + "__onShow");
			};
			options.onClose = function() {
				trigger(options.id + "__onClose");
			};

			if (typeof top.PopWindow.extensionDelegates == "undefined") {
				top.PopWindow.extensionDelegates = {};
			}
			var pop = top.PopWindow.extensionDelegates[options.id] = new PopWindow(options);
			jQuery(".pop-window-content", pop.view).css("padding", 0).css("height", "100%");
		}, options).then(function() {
			var delegate = {
				id: options.id,
				options: options,
				el: document.getElementById(options.id),
				show: function() {
					return new Promise(function(resolve, reject) {
						function onShow() {
							resolve(delegate);
							app.unbindEvent(options.id + "__onShow", onShow);
						}
						app.bindEvent(options.id + "__onShow", onShow);

						localScript(function(id) {
							top.PopWindow.extensionDelegates[id].show();
						}, options.id);
					}).then(function(pop) {
						if (options.onShow) {
							options.onShow(pop);
						}
						return pop;
					});
				},
				close: function() {
					return new Promise(function(resolve, reject) {
						function onClose() {
							resolve(delegate);
							app.unbindEvent(options.id + "__onClose", onClose);
						}
						app.bindEvent(options.id + "__onClose", onClose);

						localScript(function(id) {
							top.PopWindow.extensionDelegates[id].close();
						}, options.id);
					}).then(function(pop) {
						if (options.onClose) {
							options.onClose(pop);
						}
						return pop;
					});
				},
				layout: function(isAnimate) {
					localScript(function(args) {
						top.PopWindow.extensionDelegates[args.id].layout(args.isAnimate);
					}, {
						id: options.id,
						isAnimate: isAnimate || false
					});
					return Promise.resolve(delegate);
				}
			};
			return delegate;
		});
	},

	bindEvent: document.addEventListener.bind(document),
	unbindEvent: document.removeEventListener.bind(document),

	getQueryParams: function(query) {
		if (query.charAt(0) !== "?") query = "?" + query;
		return purl(query).param();
	},

	getTmpl: function(name) {
		return fetch(chrome.extension.getURL("tmpl/" + name)).then(function(response) {
			return response.text();
		});
	},

};
app.init();